from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from dotenv import load_dotenv
import os
import sys
import threading
import uuid
from werkzeug.utils import secure_filename
import logging
import traceback
from pathlib import Path

# Add backend directory to Python path if running from project root
current_dir = Path(__file__).parent.resolve()
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

from pipeline.input.factory import InputProcessorFactory, InputType
from pipeline.input.audio import AudioProcessor
from pipeline.input.image import ImageProcessor
from pipeline.input.text import TextFileProcessor
from pipeline.input.pdf import PDFProcessor
from calendars.service import CalendarService
from pipeline.personalization.service import PersonalizationService

from pipeline.personalization.pattern_discovery import PatternDiscoveryService
from calendars.data_collection import DataCollectionService

# Database and Storage imports
from database.models import User, Session as DBSession, Event
from pipeline.input.storage import FileStorage
from pipeline.events import EventService

# Import pipeline modules
from pipeline.extraction.extract import UnifiedExtractor
from pipeline.resolution.temporal_resolver import resolve_temporal
from pipeline.modification.agent import EventModificationAgent
from pipeline.personalization.agent import PersonalizationAgent

# Import route blueprints
from calendars.routes import calendar_bp
from auth.routes import auth_bp
from pipeline.session_routes import sessions_bp
from pipeline.input.email.routes import inbound_email_bp
from billing.routes import billing_bp

# Import auth middleware
from auth.middleware import require_auth

# Import session processor
from pipeline.orchestrator import SessionProcessor

from config.processing import ProcessingConfig
from config.posthog import init_posthog, set_tracking_context, flush_posthog, capture_agent_error

# Import rate limit configuration
from config.rate_limit import RateLimitConfig

load_dotenv()

# Initialize PostHog analytics
init_posthog()

# Initialize Stripe products/prices (idempotent)
from billing.stripe_setup import ensure_stripe_products
ensure_stripe_products()

app = Flask(__name__)

# Configure CORS to allow frontend origins
allowed_origins = [
    'http://localhost:3000',      # Local frontend dev
    'http://localhost:5173',      # Vite default dev port
    'https://www.dropcal.ai',     # Production frontend
    'https://dropcal.ai',         # Production frontend (without www)
]

CORS(app,
     origins=allowed_origins,
     supports_credentials=True,
     allow_headers=['Content-Type', 'Authorization'],
     methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

# Configure rate limiting
# Default limits are generous (authenticated users make many calls on page load).
# Guest endpoints have stricter explicit @limiter.limit() decorators.
# OPTIONS is always exempt (CORS preflight).
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    storage_uri=RateLimitConfig.get_storage_uri(),
    default_limits=RateLimitConfig.AUTHENTICATED_LIMITS,
    default_limits_exempt_when=lambda: request.method == 'OPTIONS'
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.after_request
def after_request_flush_posthog(response):
    """Flush PostHog events after each request so LLM analytics are sent immediately."""
    flush_posthog()
    return response

# Log rate limiting configuration
if RateLimitConfig.is_production():
    logger.info(f"Rate limiting: Using Redis at {RateLimitConfig.REDIS_URL}")
else:
    logger.warning("Rate limiting: Using in-memory storage (development only)")

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(calendar_bp)
app.register_blueprint(sessions_bp)
app.register_blueprint(inbound_email_bp)
app.register_blueprint(billing_bp)

# Exempt Stripe webhook from rate limiting (called server-to-server by Stripe)
limiter.exempt(billing_bp)

# Configure upload folder
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
from config.limits import FileLimits
app.config['MAX_CONTENT_LENGTH'] = FileLimits.MAX_UPLOAD_BYTES

# ============================================================================
# CENTRALIZED MODEL CONFIGURATION
# ============================================================================

from config.text import create_text_model, print_text_config
from config.audio import print_audio_config

# Create LLM instances for each pipeline stage
llm_extract = create_text_model('extract')
llm_modify = create_text_model('modify')
llm_personalize = create_text_model('personalize')
llm_pattern_discovery = create_text_model('pattern_discovery')
llm_vision = create_text_model('vision')

# Print configuration on startup
print_text_config()
print_audio_config()

# ============================================================================

# Initialize Google Calendar service
calendar_service = CalendarService()

# Initialize Personalization service
personalization_service = PersonalizationService()

# Initialize Pattern Discovery service
pattern_discovery_service = PatternDiscoveryService(llm_pattern_discovery)

# Initialize Data Collection service
data_collection_service = DataCollectionService(calendar_service)

# Initialize agents
extractor = UnifiedExtractor(llm_extract, llm_vision=llm_vision)
modify_agent = EventModificationAgent(llm_modify)
personalize_agent = PersonalizationAgent(llm_personalize)

# Initialize input processor factory and register all processors
input_processor_factory = InputProcessorFactory()

# Register audio processor (uses config/audio_config.py to determine provider)
audio_processor = AudioProcessor()
input_processor_factory.register_processor(InputType.AUDIO, audio_processor)

# Register image processor
image_processor = ImageProcessor()
input_processor_factory.register_processor(InputType.IMAGE, image_processor)

# Register text file processor
text_processor = TextFileProcessor()
input_processor_factory.register_processor(InputType.TEXT, text_processor)

# Register PDF processor
pdf_processor = PDFProcessor()
input_processor_factory.register_processor(InputType.PDF, pdf_processor)

# Register document processor (docx, pptx, xlsx, html, csv, epub, etc.)
from pipeline.input.document import DocumentProcessor
document_processor = DocumentProcessor()
input_processor_factory.register_processor(InputType.DOCUMENT, document_processor)

# Initialize Pattern Refresh service (incremental background refresh)
from pipeline.personalization.pattern_refresh import PatternRefreshService
pattern_refresh_service = PatternRefreshService(
    pattern_discovery_service=pattern_discovery_service,
)

# Initialize session processor
session_processor = SessionProcessor(
    llm_extract, input_processor_factory,
    llm_personalization=llm_personalize,
    pattern_refresh_service=pattern_refresh_service,
    llm_vision=llm_vision,
)
app.session_processor = session_processor


# ============================================================================
# Flask Endpoints
# ============================================================================

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'message': 'Backend is running'})

@app.route('/process', methods=['POST'])
def process_input():
    """
    Unified endpoint for processing all input types and extracting calendar events.
    Handles: text, audio, images, PDFs, and other text files.

    Runs pipeline: EXTRACT → RESOLVE

    For text input: Send JSON with {"text": "your text here"}
    For file input: Send multipart/form-data with file upload

    Returns: List of formatted calendar events ready to create
    """
    # Step 1: Preprocess input
    raw_input = ''
    metadata = {}

    if request.is_json:
        data = request.get_json()
        raw_input = data.get('text', '')

        if not raw_input:
            return jsonify({'error': 'No text provided'}), 400

        if len(raw_input) > ProcessingConfig.MAX_TEXT_INPUT_LENGTH:
            return jsonify({
                'error': ProcessingConfig.get_text_limit_error_message(len(raw_input)),
                'error_type': 'input_too_large'
            }), 413

        metadata = {'source': 'direct_text'}

    elif 'file' in request.files:
        file = request.files['file']

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        try:
            result = input_processor_factory.auto_process_file(filepath)
            os.remove(filepath)

            if not result.success:
                return jsonify({'success': False, 'error': result.error}), 400

            raw_input = result.text
            metadata = result.metadata

        except Exception as e:
            if os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({'error': f'File processing failed: {str(e)}'}), 500

    else:
        return jsonify({'error': 'No file or text provided'}), 400

    # Step 2: Determine user timezone (if authenticated)
    timezone = 'America/New_York'
    try:
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            from auth.middleware import verify_token
            token = auth_header.replace('Bearer ', '')
            decoded = verify_token(token)
            if decoded:
                user_id = decoded.get('sub')
                user_tz = PersonalizationService.get_timezone(user_id)
                if user_tz:
                    timezone = user_tz
    except Exception as e:
        logger.warning(f"Could not load user timezone: {e}")

    # Set PostHog tracking context
    requires_vision = metadata.get('requires_vision', False)
    input_type = 'image' if requires_vision else 'text'
    set_tracking_context(
        distinct_id=locals().get('user_id', 'guest'),
        trace_id=f"process-{uuid.uuid4().hex[:8]}",
        pipeline="Guest processing",
        input_type=input_type,
        is_guest=True,
    )

    # Step 3: EXTRACT → RESOLVE
    try:
        extracted_events = extractor.execute(
            raw_input, input_type=input_type, metadata=metadata
        )

        if not extracted_events:
            return jsonify({
                'success': True,
                'events': [],
                'message': 'No calendar events found in input'
            })

        # Resolve temporal expressions per event
        calendar_events = []
        warnings = []
        for i, extracted in enumerate(extracted_events):
            try:
                calendar_event = resolve_temporal(extracted, user_timezone=timezone)
                calendar_events.append(calendar_event.model_dump())
            except Exception as e:
                logger.warning(f"Temporal resolution failed for event {i+1}: {e}")
                warnings.append(f"Event {i+1} ('{extracted.summary}'): {str(e)}")

        response = {
            'success': True,
            'num_events': len(calendar_events),
            'events': calendar_events,
        }
        if warnings:
            response['warnings'] = warnings

        return jsonify(response)

    except Exception as e:
        logger.error(f"Error in extraction pipeline: {e}\n{traceback.format_exc()}")
        capture_agent_error("pipeline", e)
        return jsonify({
            'success': False,
            'error': f'Event extraction failed: {str(e)}',
            'error_type': 'internal_error'
        }), 500


# ============================================================================
# Event Management
# ============================================================================

@app.route('/edit-event', methods=['POST'])
def edit_event():
    """
    MODIFY: apply user edits
    Takes a list of calendar events and a natural language edit instruction.
    Returns only the actions needed (edits and deletes).
    """
    data = request.get_json()
    events = data.get('events')
    edit_instruction = data.get('instruction')
    calendars = data.get('calendars', [])
    edit_session_id = data.get('session_id')

    if not events or not isinstance(events, list):
        return jsonify({'error': 'No events list provided'}), 400

    if not edit_instruction:
        return jsonify({'error': 'No edit instruction provided'}), 400

    try:
        # Set PostHog tracking context (try to get user from auth header)
        edit_user_id = 'anonymous'
        try:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                from auth.middleware import verify_token
                decoded = verify_token(auth_header.replace('Bearer ', ''))
                if decoded:
                    edit_user_id = decoded.get('sub', 'anonymous')
        except Exception:
            pass

        # Modification gets its own trace_id but groups under the original
        # session via session_id so PostHog shows pipeline + edits together.
        set_tracking_context(
            distinct_id=edit_user_id,
            trace_id=f"edit-{uuid.uuid4().hex[:8]}",
            session_id=edit_session_id,
            pipeline="Edit event",
            input_type='modification',
            is_guest=edit_user_id == 'anonymous',
        )

        # Use the MODIFY agent
        result = modify_agent.execute(events, edit_instruction, calendars=calendars)

        return jsonify({
            'success': True,
            'actions': [a.model_dump() for a in result.actions],
            'message': result.message
        })

    except Exception as e:
        logger.error(f"Event modification failed: {e}\n{traceback.format_exc()}")
        capture_agent_error("modification", e)
        return jsonify({'error': f'Event modification failed: {str(e)}'}), 500


@app.route('/events/<event_id>', methods=['PATCH'])
@require_auth
def update_event(event_id):
    """
    Update a single event. Persists user edits from the workspace.

    Requires authentication. Only allows updating events owned by the user.
    Bumps the event version so provider sync status can detect changes.

    Accepts CalendarEvent-shaped JSON body with any subset of fields.
    """
    try:
        user_id = request.user_id

        event = Event.get_by_id(event_id)
        if not event:
            return jsonify({'error': 'Event not found'}), 404
        if event.get('user_id') != user_id:
            return jsonify({'error': 'Unauthorized'}), 403

        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # Map frontend CalendarEvent fields → flat DB columns
        updates = {}
        if 'summary' in data:
            updates['summary'] = data['summary']
        if 'location' in data:
            updates['location'] = data['location']
        if 'description' in data:
            updates['description'] = data['description']
        if 'calendar' in data:
            updates['calendar_name'] = data['calendar']  # frontend sends provider calendar ID

        if 'start' in data:
            start = data['start']
            if 'dateTime' in start:
                updates['start_time'] = start['dateTime']
            if 'date' in start:
                updates['start_date'] = start['date']
                updates['is_all_day'] = True
            if 'timeZone' in start:
                updates['timezone'] = start['timeZone']

        if 'end' in data:
            end = data['end']
            if 'dateTime' in end:
                updates['end_time'] = end['dateTime']
            if 'date' in end:
                updates['end_date'] = end['date']

        # Recurrence and attendees stored as top-level columns
        if 'recurrence' in data:
            updates['recurrence'] = data['recurrence']  # list of RRULE strings or None
        if 'attendees' in data:
            updates['attendees'] = data['attendees']  # list of email strings or None

        if updates:
            updates['user_modified'] = True
            Event.update(event_id, updates)
            # Bump version so provider sync detects the change
            Event.increment_version(event_id)

        # Return the updated event in CalendarEvent format
        updated_event = Event.get_by_id(event_id)
        return jsonify({
            'success': True,
            'event': EventService.event_row_to_calendar_event(updated_event)
        })

    except Exception as e:
        return jsonify({'error': f'Failed to update event: {str(e)}'}), 500


@app.route('/events/<event_id>', methods=['DELETE'])
@require_auth
def delete_event(event_id):
    """
    Soft-delete a single event. Sets deleted_at so it's excluded from future queries.
    Also removes the event ID from its parent session's event_ids array.

    Requires authentication. Only allows deleting events owned by the user.
    """
    try:
        user_id = request.user_id

        event = Event.get_by_id(event_id)
        if not event:
            return jsonify({'error': 'Event not found'}), 404
        if event.get('user_id') != user_id:
            return jsonify({'error': 'Unauthorized'}), 403

        Event.soft_delete(event_id)

        # Remove from parent session's event_ids
        session_id = event.get('session_id')
        remaining_event_count = None
        if session_id:
            try:
                updated_session = DBSession.remove_event(session_id, event_id)
                remaining_event_count = len(updated_session.get('event_ids') or [])
            except Exception:
                pass  # Non-critical — session list will self-correct on next fetch

        return jsonify({
            'success': True,
            'event_id': event_id,
            'session_id': session_id,
            'remaining_event_count': remaining_event_count,
        })

    except Exception as e:
        return jsonify({'error': f'Failed to delete event: {str(e)}'}), 500


@app.route('/events/check-conflicts', methods=['POST'])
@require_auth
def check_event_conflicts():
    """
    Batch conflict check: for each event in the request, find overlapping
    events already in the user's calendar (excluding events from the
    same session so a session's own events don't conflict with themselves).

    Handles recurring events in both directions:
    - Candidate events with RRULEs: expands occurrences, checks each against DB
    - Existing recurring events in DB: expands occurrences, checks against candidates
    """
    from pipeline.resolution.rrule_utils import expand_rrule, parse_event_times, times_overlap

    try:
        user_id = request.user_id
        data = request.get_json()

        if not data or 'events' not in data:
            return jsonify({'error': 'events array is required'}), 400

        events = data['events']
        session_id = data.get('session_id')

        # Get event IDs belonging to current session to exclude from results
        exclude_ids = set()
        if session_id:
            session = DBSession.get_by_id(session_id)
            if session:
                exclude_ids = set(session.get('event_ids') or [])

        # Pre-fetch existing recurring events for direction B checks
        existing_recurring = Event.get_recurring_events(user_id)
        # Filter out events from the same session
        existing_recurring = [
            e for e in existing_recurring if e.get('id') not in exclude_ids
        ]

        conflicts = {}
        for i, event in enumerate(events):
            parsed = parse_event_times(event)
            if not parsed:
                continue

            event_start, event_end = parsed
            event_duration = event_end - event_start
            event_conflicts = []
            seen = set()  # deduplicate by (summary, start_time)

            # --- Direction A: check candidate's base occurrence against DB ---
            raw_conflicts = EventService.get_conflicting_events(
                user_id, event_start.isoformat(), event_end.isoformat()
            )
            for c in raw_conflicts:
                if c.get('id') in exclude_ids:
                    continue
                key = (c.get('summary', ''), c.get('start_time', ''))
                if key not in seen:
                    seen.add(key)
                    event_conflicts.append({
                        'summary': c.get('summary', 'Untitled'),
                        'start_time': c.get('start_time', ''),
                        'end_time': c.get('end_time', ''),
                    })

            # --- Direction A+: if candidate is recurring, check future occurrences ---
            candidate_recurrence = event.get('recurrence')
            if candidate_recurrence:
                occurrences = expand_rrule(
                    candidate_recurrence, event_start, event_duration
                )
                # Skip the first occurrence (already checked above)
                for occ_start, occ_end in occurrences[1:]:
                    raw = EventService.get_conflicting_events(
                        user_id, occ_start.isoformat(), occ_end.isoformat()
                    )
                    for c in raw:
                        if c.get('id') in exclude_ids:
                            continue
                        key = (c.get('summary', ''), c.get('start_time', ''))
                        if key not in seen:
                            seen.add(key)
                            event_conflicts.append({
                                'summary': c.get('summary', 'Untitled'),
                                'start_time': c.get('start_time', ''),
                                'end_time': c.get('end_time', ''),
                            })

            # --- Direction B: check existing recurring events against candidate ---
            for rec_event in existing_recurring:
                rec_start = rec_event.get('start_time')
                rec_end = rec_event.get('end_time')
                rec_rules = rec_event.get('recurrence')
                if not rec_start or not rec_end or not rec_rules:
                    continue

                try:
                    from dateutil.parser import isoparse
                    rec_dt_start = isoparse(rec_start)
                    rec_dt_end = isoparse(rec_end)
                    rec_duration = rec_dt_end - rec_dt_start

                    rec_occurrences = expand_rrule(
                        rec_rules, rec_dt_start, rec_duration
                    )

                    for occ_start, occ_end in rec_occurrences:
                        if times_overlap(event_start, event_end, occ_start, occ_end):
                            key = (rec_event.get('summary', ''), occ_start.isoformat())
                            if key not in seen:
                                seen.add(key)
                                event_conflicts.append({
                                    'summary': rec_event.get('summary', 'Untitled'),
                                    'start_time': occ_start.isoformat(),
                                    'end_time': occ_end.isoformat(),
                                })
                except (ValueError, TypeError):
                    continue

            if event_conflicts:
                conflicts[str(i)] = event_conflicts

        return jsonify({'conflicts': conflicts})

    except Exception as e:
        return jsonify({'error': f'Conflict check failed: {str(e)}'}), 500


# ============================================================================
# Personalization Endpoints
# ============================================================================

@app.route('/personalization/apply', methods=['POST'])
@require_auth
def apply_preferences_endpoint():
    """
    PERSONALIZE: Apply user preferences to a calendar event.

    Supports both new pattern format and legacy preferences format.

    Requires authentication. User ID is extracted from JWT token.

    Expects JSON body:
    {
        "event": {...}  # CalendarEvent from STRUCTURE stage
    }

    Returns personalized event with user preferences applied.
    """
    try:
        from pipeline.models import CalendarEvent

        data = request.get_json()
        event_dict = data.get('event') or data.get('facts')  # Accept both for backwards compat

        # Get user_id from auth middleware (set by @require_auth)
        user_id = request.user_id

        if not event_dict:
            return jsonify({'error': 'No event provided'}), 400

        # Convert dict to CalendarEvent model
        event = CalendarEvent(**event_dict)

        # Set PostHog tracking context
        set_tracking_context(
            distinct_id=user_id,
            trace_id=f"prefs-{uuid.uuid4().hex[:8]}",
            pipeline="Apply preferences",
            input_type='personalization',
            is_guest=False,
        )

        # Load patterns from DB (style_stats + calendar patterns)
        patterns = personalization_service.load_patterns(user_id)

        if not patterns:
            return jsonify({
                'event': event_dict,
                'preferences_applied': False,
                'message': 'No user patterns found. Connect your calendar first.'
            })

        historical_events = []
        try:
            from config.database import QueryLimits
            historical_events = EventService.get_historical_events_with_embeddings(
                user_id=user_id,
                limit=QueryLimits.PERSONALIZATION_HISTORICAL_LIMIT
            )
        except Exception as e:
            logger.warning(f"Could not fetch historical events: {e}")

        personalized_events, _ = personalize_agent.execute_batch(
            events=[event],
            discovered_patterns=patterns,
            historical_events=historical_events,
            user_id=user_id,
        )

        return jsonify({
            'event': personalized_events[0].model_dump(),
            'preferences_applied': True,
            'user_id': user_id,
            'events_analyzed': patterns.get('total_events_analyzed', 0),
        })

    except Exception as e:
        logger.error(f"Error in preference application: {e}\n{traceback.format_exc()}")
        capture_agent_error("personalization", e)
        return jsonify({'error': f'Preference application failed: {str(e)}'}), 500


@app.route('/personalization/preferences', methods=['GET'])
@require_auth
def get_preferences():
    """
    Get the authenticated user's personalization data (patterns + calendars).

    Requires authentication. User ID is extracted from JWT token.
    """
    try:
        user_id = request.user_id
        patterns = personalization_service.load_patterns(user_id)

        if not patterns:
            return jsonify({
                'exists': False,
                'message': f'No preferences found for user {user_id}'
            })

        return jsonify({
            'exists': True,
            'style_stats': patterns.get('style_stats', {}),
            'total_events_analyzed': patterns.get('total_events_analyzed', 0),
            'calendars': len(patterns.get('category_patterns', {})),
        })

    except Exception as e:
        return jsonify({'error': f'Failed to get preferences: {str(e)}'}), 500


@app.route('/personalization/patterns', methods=['DELETE'])
@require_auth
def delete_patterns():
    """
    Delete the authenticated user's discovered patterns.

    Requires authentication. User ID is extracted from JWT token.
    """
    try:
        # Get user_id from auth middleware (set by @require_auth)
        user_id = request.user_id

        success = personalization_service.delete_patterns(user_id)

        # Also clean up calendar rows in DB
        from database.models import Calendar
        Calendar.delete_by_user(user_id)

        if success:
            return jsonify({
                'success': True,
                'message': f'Patterns and calendars deleted for user {user_id}'
            })
        else:
            return jsonify({
                'success': False,
                'message': f'No patterns to delete for user {user_id}'
            }), 404

    except Exception as e:
        return jsonify({'error': f'Failed to delete patterns: {str(e)}'}), 500


# ============================================================================
# Database-backed Session Management Endpoints
# ============================================================================

@app.route('/sessions', methods=['POST'])
@require_auth
def create_text_session():
    """
    Create a new session with text input.

    Requires authentication. User ID is extracted from JWT token.

    Expects JSON body:
    {
        "text": "Meeting tomorrow at 2pm"
    }

    Returns the created session object.
    """
    try:
        data = request.json

        # Get user_id from auth middleware (set by @require_auth)
        user_id = request.user_id
        input_text = data.get('text')

        if not input_text:
            return jsonify({'error': 'No text provided'}), 400

        # Plan-based text input limit
        from auth.plan_limits import get_user_limits
        limits = get_user_limits(user_id)
        if len(input_text) > limits.max_text_input_length:
            return jsonify({
                'error': 'You\'ve hit a limit on your current plan. Upgrade to Pro to keep creating!',
                'error_type': 'plan_limit',
                'upgrade_url': '/plans'
            }), 403

        # Create session in database
        session = DBSession.create(
            user_id=user_id,
            input_type='text',
            input_content=input_text
        )

        # Init SSE stream before spawning pipeline
        from pipeline.stream import init_stream
        init_stream(session['id'])

        # Start processing in background thread
        thread = threading.Thread(
            target=session_processor.process_text_session,
            args=(session['id'], input_text)
        )
        thread.daemon = True  # Don't block server shutdown
        thread.start()

        return jsonify({
            'success': True,
            'session': session,
            'message': 'Session created, processing started'
        }), 201

    except Exception as e:
        return jsonify({'error': f'Failed to create session: {str(e)}'}), 500


@app.route('/upload', methods=['POST'])
@require_auth
def upload_file_endpoint():
    """
    Upload a file and create a session.

    Requires authentication. User ID is extracted from JWT token.
    File type is auto-detected from MIME type / extension.

    Expects multipart/form-data with:
    - file: The file to upload

    Returns the created session object with file path.
    """
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']

        # Get user_id from auth middleware (set by @require_auth)
        user_id = request.user_id

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Auto-detect file type from MIME type / extension
        file_type = FileStorage.detect_file_type(file.content_type, file.filename)
        if not file_type:
            return jsonify({
                'error': f'Unsupported file type: {file.content_type} ({file.filename})'
            }), 400

        # Plan-based feature checks for file types
        from auth.plan_limits import get_user_limits
        limits = get_user_limits(user_id)
        if file_type == 'audio' and not limits.audio_input_enabled:
            return jsonify({
                'error': 'You\'ve hit a limit on your current plan. Upgrade to Pro to keep creating!',
                'error_type': 'plan_limit',
                'upgrade_url': '/plans'
            }), 403
        if file_type == 'pdf' and not limits.pdf_input_enabled:
            return jsonify({
                'error': 'You\'ve hit a limit on your current plan. Upgrade to Pro to keep creating!',
                'error_type': 'plan_limit',
                'upgrade_url': '/plans'
            }), 403
        if file_type == 'document' and not limits.document_input_enabled:
            return jsonify({
                'error': 'You\'ve hit a limit on your current plan. Upgrade to Pro to keep creating!',
                'error_type': 'plan_limit',
                'upgrade_url': '/plans'
            }), 403

        # Upload to Supabase Storage
        file_path = FileStorage.upload_file(
            file=file,
            filename=file.filename,
            user_id=user_id,
            file_type=file_type
        )

        try:
            # Create session in database
            session = DBSession.create(
                user_id=user_id,
                input_type=file_type,
                input_content=file_path
            )
        except Exception:
            # Clean up orphaned file if session creation fails
            FileStorage.delete_file(file_path)
            raise

        # Init SSE stream before spawning pipeline
        from pipeline.stream import init_stream
        init_stream(session['id'])

        # Start processing in background thread
        thread = threading.Thread(
            target=session_processor.process_file_session,
            args=(session['id'], file_path, file_type)
        )
        thread.daemon = True  # Don't block server shutdown
        thread.start()

        return jsonify({
            'success': True,
            'session': session,
            'file_path': file_path,
            'message': 'File uploaded, processing started'
        }), 201

    except Exception as e:
        return jsonify({'error': f'File upload failed: {str(e)}'}), 500


@app.route('/sessions/<session_id>', methods=['GET'])
@require_auth
def get_session_by_id(session_id):
    """
    Get a session by ID.

    Requires authentication. Only returns sessions owned by the authenticated user.

    Returns the session object if found, 404 otherwise.
    """
    try:
        user_id = request.user_id
        session = DBSession.get_by_id(session_id)

        if not session:
            return jsonify({'error': 'Session not found'}), 404

        # Verify session belongs to user
        if session.get('user_id') != user_id:
            return jsonify({'error': 'Unauthorized'}), 403

        return jsonify({
            'success': True,
            'session': session
        })

    except Exception as e:
        return jsonify({'error': f'Failed to get session: {str(e)}'}), 500


@app.route('/sessions/<session_id>/events', methods=['GET'])
@require_auth
def get_session_events(session_id):
    """
    Get events for a session from the events table, formatted as CalendarEvents.

    Requires authentication. Only returns events for sessions owned by the user.
    Falls back to session.processed_events for backward compat with old sessions.
    """
    try:
        user_id = request.user_id
        session = DBSession.get_by_id(session_id)

        if not session:
            return jsonify({'error': 'Session not found'}), 404
        if session.get('user_id') != user_id:
            return jsonify({'error': 'Unauthorized'}), 403

        # Try events table first (pass event_ids to skip redundant session lookup)
        event_ids = session.get('event_ids') or []
        events = EventService.get_events_by_session(session_id, event_ids=event_ids)

        # Backward compat: fall back to processed_events blob for old sessions
        if not events:
            processed = session.get('processed_events') or []
            if processed:
                events = processed

        return jsonify({
            'success': True,
            'events': events,
            'count': len(events)
        })

    except Exception as e:
        return jsonify({'error': f'Failed to get events: {str(e)}'}), 500


@app.route('/sessions', methods=['GET'])
@require_auth
def get_user_sessions():
    """
    Get all sessions for the authenticated user.

    Requires authentication. User ID is extracted from JWT token.

    Query parameters:
    - limit: Maximum number of sessions to return (default 50)

    Returns list of sessions ordered by created_at desc.
    """
    try:
        # Get user_id from auth middleware (set by @require_auth)
        user_id = request.user_id
        from config.database import QueryLimits
        limit = int(request.args.get('limit', QueryLimits.DEFAULT_SESSION_LIMIT))

        sessions = DBSession.get_by_user(user_id, limit=limit)

        return jsonify({
            'success': True,
            'count': len(sessions),
            'sessions': sessions
        })

    except Exception as e:
        return jsonify({'error': f'Failed to get sessions: {str(e)}'}), 500


# ============================================================================
# Guest Mode Endpoints (No Authentication Required)
# ============================================================================

@app.route('/sessions/guest', methods=['POST'])
@limiter.limit("10 per hour")
def create_guest_text_session():
    """
    Create a guest session with text input (no authentication required).

    Allows users to process up to 3 sessions before requiring sign-in.
    Rate limited to 10 requests per hour per IP address.

    Expects JSON body:
    {
        "input_type": "text",
        "input_content": "Meeting tomorrow at 2pm"
    }

    Returns the created session object with guest_mode=True.
    """
    try:
        data = request.get_json()

        input_type = data.get('input_type', 'text')
        input_content = data.get('input_content')

        if not input_content:
            return jsonify({'error': 'No input content provided'}), 400

        if input_type == 'text' and len(input_content) > ProcessingConfig.MAX_TEXT_INPUT_LENGTH:
            return jsonify({
                'error': ProcessingConfig.get_text_limit_error_message(len(input_content)),
                'error_type': 'input_too_large'
            }), 413

        # Generate anonymous guest ID (must be valid UUID for DB column)
        guest_id = str(uuid.uuid4())

        # Create session in database with guest_mode=True
        session = DBSession.create(
            user_id=guest_id,
            input_type=input_type,
            input_content=input_content,
            guest_mode=True
        )

        # Init SSE stream before spawning pipeline
        from pipeline.stream import init_stream
        init_stream(session['id'])

        # Start processing in background thread
        thread = threading.Thread(
            target=session_processor.process_text_session,
            args=(session['id'], input_content)
        )
        thread.daemon = True
        thread.start()

        return jsonify({
            'success': True,
            'session': session,
            'message': 'Guest session created, processing started'
        }), 201

    except Exception as e:
        logger.error(f"Failed to create guest text session: {e}")
        return jsonify({'error': f'Failed to create guest session: {str(e)}'}), 500


@app.route('/upload/guest', methods=['POST'])
@limiter.limit("10 per hour")
def upload_guest_file():
    """
    Upload a file as guest (no authentication required).

    Allows users to process up to 3 sessions before requiring sign-in.
    Rate limited to 10 requests per hour per IP address.
    File type is auto-detected from MIME type / extension.

    Expects multipart/form-data with:
    - file: The file to upload

    Returns the created session object with guest_mode=True and file path.
    """
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Auto-detect file type from MIME type / extension
        file_type = FileStorage.detect_file_type(file.content_type, file.filename)
        if not file_type:
            return jsonify({
                'error': f'Unsupported file type: {file.content_type} ({file.filename})'
            }), 400

        # Generate anonymous guest ID (must be valid UUID for DB column)
        guest_id = str(uuid.uuid4())

        # Upload to Supabase Storage (uses guest_id as user_id)
        file_path = FileStorage.upload_file(
            file=file,
            filename=file.filename,
            user_id=guest_id,
            file_type=file_type
        )

        try:
            # Create session in database with guest_mode=True
            session = DBSession.create(
                user_id=guest_id,
                input_type=file_type,
                input_content=file_path,
                guest_mode=True
            )
        except Exception:
            FileStorage.delete_file(file_path)
            raise

        # Init SSE stream before spawning pipeline
        from pipeline.stream import init_stream
        init_stream(session['id'])

        # Start processing in background thread
        thread = threading.Thread(
            target=session_processor.process_file_session,
            args=(session['id'], file_path, file_type)
        )
        thread.daemon = True
        thread.start()

        return jsonify({
            'success': True,
            'session': session,
            'file_url': file_path,
            'message': 'Guest file uploaded, processing started'
        }), 201

    except Exception as e:
        logger.error(f"Failed to upload guest file: {e}")
        return jsonify({'error': f'Guest file upload failed: {str(e)}'}), 500


@app.route('/sessions/guest/<session_id>', methods=['GET'])
@limiter.limit("50 per hour")
def get_guest_session(session_id):
    """
    Get a guest session by ID with access token verification.

    Requires access_token query parameter for security.
    Only returns sessions with guest_mode=True and matching access token.
    Authenticated sessions require the regular /api/sessions/<id> endpoint.
    Rate limited to 50 requests per hour per IP address.

    Query params:
        access_token: The access token returned when the session was created

    Returns the session object if token is valid, error otherwise.
    """
    try:
        # Get access token from query parameter
        access_token = request.args.get('access_token')

        if not access_token:
            return jsonify({
                'error': 'Access token required',
                'message': 'Please provide access_token query parameter'
            }), 401

        # Verify token and retrieve session in one query
        session = DBSession.verify_guest_token(session_id, access_token)

        if not session:
            return jsonify({
                'error': 'Invalid session or access token',
                'message': 'Session not found or access token is incorrect'
            }), 403

        return jsonify({
            'success': True,
            'session': session
        })

    except Exception as e:
        logger.error(f"Failed to get guest session: {e}")
        return jsonify({'error': f'Failed to get session: {str(e)}'}), 500


@app.route('/sessions/guest/<session_id>/events', methods=['GET'])
@limiter.limit("50 per hour")
def get_guest_session_events(session_id):
    """
    Get events for a guest session from the events table.

    Requires access_token query parameter for security.
    Falls back to session.processed_events for backward compat.
    """
    try:
        access_token = request.args.get('access_token')
        if not access_token:
            return jsonify({'error': 'Access token required'}), 401

        session = DBSession.verify_guest_token(session_id, access_token)
        if not session:
            return jsonify({'error': 'Invalid session or access token'}), 403

        # Try events table first (pass event_ids to skip redundant session lookup)
        event_ids = session.get('event_ids') or []
        events = EventService.get_events_by_session(session_id, event_ids=event_ids)

        # Backward compat: fall back to processed_events blob
        if not events:
            processed = session.get('processed_events') or []
            if processed:
                events = processed

        return jsonify({
            'success': True,
            'events': events,
            'count': len(events)
        })

    except Exception as e:
        return jsonify({'error': f'Failed to get events: {str(e)}'}), 500


# ============================================================================
# Firecrawl Link Scraping Endpoint
# ============================================================================

@app.route('/scrape-url', methods=['POST'])
@limiter.limit("20 per hour")
def scrape_url():
    """
    Scrape a URL using Firecrawl API.

    Rate limited to 20 requests per hour per IP address.

    Expects JSON body:
    {
        "url": "https://example.com"
    }

    Returns the scraped content as markdown.
    """
    try:
        import requests

        data = request.get_json()
        url = data.get('url')

        if not url:
            return jsonify({'error': 'No URL provided'}), 400

        # Add https:// if not present
        if not url.startswith('http://') and not url.startswith('https://'):
            url = 'https://' + url

        # Call Firecrawl API
        firecrawl_api_key = os.getenv('FIRECRAWL_API_KEY')
        if not firecrawl_api_key:
            return jsonify({'error': 'FIRECRAWL_API_KEY not configured'}), 500

        response = requests.post(
            'https://api.firecrawl.dev/v1/scrape',
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {firecrawl_api_key}'
            },
            json={
                'url': url,
                'formats': ['markdown']
            },
            timeout=30
        )

        if not response.ok:
            logger.error(f"Firecrawl API error: {response.status_code} - {response.text}")
            return jsonify({
                'error': 'Failed to fetch URL content',
                'details': response.text
            }), response.status_code

        data = response.json()
        content = data.get('data', {}).get('markdown') or data.get('data', {}).get('content') or ''

        if not content:
            return jsonify({
                'error': 'No content found at URL',
                'message': 'The URL did not return any extractable content'
            }), 400

        return jsonify({
            'success': True,
            'content': content,
            'url': url
        })

    except requests.exceptions.Timeout:
        return jsonify({
            'error': 'Request timeout',
            'message': 'The URL took too long to respond'
        }), 408
    except requests.exceptions.RequestException as e:
        logger.error(f"Request error: {e}")
        return jsonify({
            'error': 'Failed to fetch URL',
            'message': str(e)
        }), 500
    except Exception as e:
        logger.error(f"Error scraping URL: {e}")
        return jsonify({'error': f'URL scraping failed: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
