from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from langchain_anthropic import ChatAnthropic
from dotenv import load_dotenv
import os
import sys
import threading
import uuid
from werkzeug.utils import secure_filename
from typing import Optional
import logging
import traceback
from pydantic import ValidationError
from pathlib import Path

# Add backend directory to Python path if running from project root
current_dir = Path(__file__).parent.resolve()
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

from processors.factory import InputProcessorFactory, InputType
from processors.audio import AudioProcessor
from processors.image import ImageProcessor
from processors.text import TextFileProcessor
from processors.pdf import PDFProcessor
from calendars.service import CalendarService
from preferences.service import PersonalizationService
from preferences.models import UserPreferences
from preferences.pattern_discovery_service import PatternDiscoveryService
from services.data_collection_service import DataCollectionService

# Database and Storage imports
from database.models import User, Session as DBSession, Event
from storage.file_handler import FileStorage
from events.service import EventService

# Import agent modules
from extraction.agents.identification import EventIdentificationAgent
from extraction.agents.facts import EventExtractionAgent
from modification.agent import EventModificationAgent
from preferences.agent import PersonalizationAgent

# Import models
from extraction.models import ExtractedFacts

# Import route blueprints
from calendars.routes import calendar_bp
from auth.routes import auth_bp
from sessions.routes import sessions_bp
from inbound_email.routes import inbound_email_bp

# Import auth middleware
from auth.middleware import require_auth

# Import session processor
from processing.session_processor import SessionProcessor

# Import processing config and parallel helper
from config.processing import ProcessingConfig
from processing.parallel import process_events_parallel, EventProcessingResult
from config.posthog import init_posthog, set_tracking_context

# Import rate limit configuration
from config.rate_limit import RateLimitConfig

load_dotenv()

# Initialize PostHog analytics
init_posthog()

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
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])

# Configure rate limiting
# Default limits are generous (authenticated users make many calls on page load).
# Guest endpoints have stricter explicit @limiter.limit() decorators.
# OPTIONS is always exempt (CORS preflight).
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    storage_uri=RateLimitConfig.get_storage_uri(),
    default_limits=["2000 per day", "500 per hour"],
    default_limits_exempt_when=lambda: request.method == 'OPTIONS'
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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

# Configure upload folder
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024  # 25MB max file size

# ============================================================================
# CENTRALIZED MODEL CONFIGURATION
# ============================================================================

from config.text import create_text_model, print_text_config
from config.audio import print_audio_config

# Create LLM instances for each component based on config
llm_agent_1 = create_text_model('agent_1_identification')
llm_agent_2 = create_text_model('agent_2_extraction')
llm_agent_4 = create_text_model('agent_4_modification')
llm_agent_5 = create_text_model('agent_5_preferences')
llm_pattern_discovery = create_text_model('pattern_discovery')
llm_session_processor = create_text_model('session_processor')

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

# Initialize Agents with their configured models
agent_1_identification = EventIdentificationAgent(llm_agent_1)
agent_2_extraction = EventExtractionAgent(llm_agent_2)
agent_4_modification = EventModificationAgent(llm_agent_4)
agent_3_personalization = PersonalizationAgent(llm_agent_5)

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

# Initialize session processor
session_processor = SessionProcessor(llm_session_processor, input_processor_factory)
app.session_processor = session_processor


# ============================================================================
# Validation Error Handling Utilities
# ============================================================================

def format_validation_error(error: ValidationError, stage: str) -> dict:
    """
    Format ValidationError into user-friendly error details.

    Args:
        error: Pydantic ValidationError
        stage: Pipeline stage ('identification', 'extraction', 'formatting')

    Returns:
        Dictionary with formatted error details
    """
    errors = []
    for err in error.errors():
        field = '.'.join(str(loc) for loc in err['loc'])
        message = err['msg']
        error_type = err['type']

        errors.append({
            'field': field,
            'message': message,
            'type': error_type,
            'input': err.get('input', 'N/A')
        })

    return {
        'stage': stage,
        'errors': errors,
        'suggestion': get_suggestion_for_stage(stage)
    }


def get_validation_summary(error: ValidationError) -> str:
    """Get one-line summary of validation errors."""
    error_count = len(error.errors())
    first_error = error.errors()[0]
    field = '.'.join(str(loc) for loc in first_error['loc'])
    message = first_error['msg']

    if error_count == 1:
        return f"{field}: {message}"
    else:
        return f"{field}: {message} (+{error_count-1} more errors)"


def get_suggestion_for_stage(stage: str) -> str:
    """Get user-facing suggestion based on pipeline stage."""
    suggestions = {
        'identification': 'Please ensure your input contains clear event information (date, time, title).',
        'extraction': 'The event information could not be properly formatted. Check that dates are in YYYY-MM-DD format and times are in HH:MM:SS format.',
        'formatting': 'The event could not be formatted for your calendar. Check that timezones and recurrence rules are valid.'
    }
    return suggestions.get(stage, 'Please check your input and try again.')


# ============================================================================
# Flask Endpoints
# ============================================================================

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'message': 'Backend is running'})

@app.route('/api/process', methods=['POST'])
def process_input():
    """
    Unified endpoint for processing all input types and extracting calendar events.
    Handles: text, audio, images, PDFs, and other text files.

    Runs full agent pipeline: Identification → Extraction → Formatting

    For text input: Send JSON with {"text": "your text here"}
    For file input: Send multipart/form-data with file upload

    Returns: List of formatted calendar events ready to create
    """
    # Step 1: Preprocess input
    raw_input = ''
    metadata = {}
    requires_vision = False

    # Check if this is a text-only request
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
        requires_vision = False

    # File upload processing
    elif 'file' in request.files:
        file = request.files['file']

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Save file temporarily
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        try:
            # Auto-detect file type and process
            result = input_processor_factory.auto_process_file(filepath)

            # Clean up the uploaded file
            os.remove(filepath)

            if not result.success:
                return jsonify({
                    'success': False,
                    'error': result.error
                }), 400

            raw_input = result.text
            metadata = result.metadata
            requires_vision = metadata.get('requires_vision', False)

        except Exception as e:
            # Clean up on error
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
                preferences_obj = personalization_service.load_preferences(user_id)
                if preferences_obj and preferences_obj.timezone:
                    timezone = preferences_obj.timezone
    except Exception as e:
        print(f"Note: Could not load user timezone: {e}")

    # Set PostHog tracking context for this request
    set_tracking_context(
        distinct_id=locals().get('user_id', 'guest'),
        trace_id=f"process-{uuid.uuid4().hex[:8]}"
    )

    # Step 3: Run full agent pipeline with validation error handling
    try:
        # Agent 1: Event Identification
        try:
            identification_result = agent_1_identification.execute(
                raw_input,
                metadata,
                requires_vision
            )
        except ValidationError as e:
            logger.error(f"Validation error in Agent 1 (Identification): {e}")
            return jsonify({
                'success': False,
                'error': 'Event identification failed',
                'details': format_validation_error(e, 'identification'),
                'error_type': 'validation_error'
            }), 400

        # Check if any events were found
        if not identification_result.has_events:
            return jsonify({
                'success': True,
                'events': [],
                'message': 'No calendar events found in input'
            })

        # Step 4: Extract events in parallel with per-event error handling
        def process_single_event_api(idx, event):
            """Process one event through Agent 2 for /api/process."""
            try:
                try:
                    calendar_event = agent_2_extraction.execute(
                        event.raw_text,
                        event.description,
                        timezone=timezone
                    )

                    # Log soft warning for long titles (>8 words)
                    warning = None
                    if len(calendar_event.summary.split()) > 8:
                        warning = f"Event {idx+1}: Title is long ({len(calendar_event.summary.split())} words). Consider shortening."
                        logger.warning(warning)

                    return EventProcessingResult(
                        index=idx, success=True,
                        calendar_event=calendar_event.model_dump(),
                        warning=warning,
                    )

                except ValidationError as e:
                    logger.error(f"Validation error in Agent 2 (Extraction) for event {idx+1}: {e}")
                    return EventProcessingResult(
                        index=idx, success=False,
                        warning=f"Event {idx+1} ('{event.description[:50]}...'): Failed validation - {get_validation_summary(e)}"
                    )

            except Exception as e:
                logger.error(f"Unexpected error processing event {idx+1}: {e}\n{traceback.format_exc()}")
                return EventProcessingResult(
                    index=idx, success=False,
                    warning=f"Event {idx+1}: Unexpected error - {str(e)}",
                    error=e,
                )

        batch_result = process_events_parallel(
            events=identification_result.events,
            process_single_event=process_single_event_api,
        )

        formatted_events = [r.calendar_event for r in batch_result.successful_results]
        validation_warnings = batch_result.warnings

        # Return results with warnings if any events failed or were truncated
        response = {
            'success': True,
            'num_events': len(formatted_events),
            'events': formatted_events
        }

        if validation_warnings:
            response['warnings'] = validation_warnings
            response['message'] = f"Successfully processed {len(formatted_events)} of {batch_result.original_count} events"

        return jsonify(response)

    except ValidationError as e:
        # Top-level validation error (shouldn't happen if we caught all above)
        logger.error(f"Top-level validation error: {e}")
        return jsonify({
            'success': False,
            'error': 'Event extraction failed due to validation errors',
            'details': format_validation_error(e, 'extraction'),
            'error_type': 'validation_error'
        }), 400

    except Exception as e:
        # Catch-all for unexpected errors
        logger.error(f"Unexpected error in extraction pipeline: {e}\n{traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': f'Event extraction failed: {str(e)}',
            'error_type': 'internal_error'
        }), 500


# ============================================================================
# Event Management
# ============================================================================

@app.route('/api/edit-event', methods=['POST'])
def edit_event():
    """
    Agent 4: Event Modification
    Takes an existing calendar event and a natural language edit instruction.
    Applies ONLY the requested changes, preserves everything else.
    """
    data = request.get_json()
    original_event = data.get('event')
    edit_instruction = data.get('instruction')

    if not original_event:
        return jsonify({'error': 'No event provided'}), 400

    if not edit_instruction:
        return jsonify({'error': 'No edit instruction provided'}), 400

    try:
        # Set PostHog tracking context
        set_tracking_context(distinct_id='anonymous', trace_id=f"edit-{uuid.uuid4().hex[:8]}")

        # Use the Event Modification Agent
        result = agent_4_modification.execute(original_event, edit_instruction)

        # Convert Pydantic model to dict for JSON response
        return jsonify({
            'success': True,
            'modified_event': result.model_dump()
        })

    except Exception as e:
        return jsonify({'error': f'Event modification failed: {str(e)}'}), 500


@app.route('/api/events/<event_id>', methods=['PATCH'])
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
            updates['calendar_name'] = data['calendar']

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


# ============================================================================
# Personalization Endpoints
# ============================================================================

@app.route('/api/personalization/apply', methods=['POST'])
@require_auth
def apply_preferences_endpoint():
    """
    Agent 3: Apply user preferences to a calendar event.

    Supports both new pattern format and legacy preferences format.

    Requires authentication. User ID is extracted from JWT token.

    Expects JSON body:
    {
        "event": {...}  # CalendarEvent from Agent 2
    }

    Returns personalized event with user preferences applied.
    """
    try:
        from extraction.models import CalendarEvent

        data = request.get_json()
        event_dict = data.get('event') or data.get('facts')  # Accept both for backwards compat

        # Get user_id from auth middleware (set by @require_auth)
        user_id = request.user_id

        if not event_dict:
            return jsonify({'error': 'No event provided'}), 400

        # Convert dict to CalendarEvent model
        event = CalendarEvent(**event_dict)

        # Set PostHog tracking context
        set_tracking_context(distinct_id=user_id, trace_id=f"prefs-{uuid.uuid4().hex[:8]}")

        # Try to load new patterns first (preferred)
        patterns = personalization_service.load_patterns(user_id)
        historical_events = []

        if patterns:
            try:
                historical_events = EventService.get_historical_events_with_embeddings(
                    user_id=user_id,
                    limit=200
                )
            except Exception as e:
                print(f"Warning: Could not fetch historical events: {e}")
                historical_events = []

            personalized_event = agent_3_personalization.execute(
                event=event,
                discovered_patterns=patterns,
                historical_events=historical_events,
                user_id=user_id
            )

            return jsonify({
                'event': personalized_event.model_dump(),
                'preferences_applied': True,
                'user_id': user_id,
                'events_analyzed': patterns.get('total_events_analyzed', 0),
                'pattern_format': 'new'
            })

        else:
            # Fall back to legacy preferences format
            preferences = personalization_service.load_preferences(user_id)

            if not preferences:
                return jsonify({
                    'event': event_dict,
                    'preferences_applied': False,
                    'message': 'No user patterns or preferences found. Run pattern discovery first.'
                })

            personalized_event = agent_3_personalization.execute(
                event=event,
                user_preferences=preferences
            )

            return jsonify({
                'event': personalized_event.model_dump(),
                'preferences_applied': True,
                'user_id': user_id,
                'events_analyzed': preferences.total_events_analyzed,
                'pattern_format': 'legacy'
            })

    except Exception as e:
        print(f"Error in preference application: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Preference application failed: {str(e)}'}), 500


@app.route('/api/personalization/preferences', methods=['GET'])
@require_auth
def get_preferences():
    """
    Get the authenticated user's saved preferences.

    Requires authentication. User ID is extracted from JWT token.

    Returns user preferences if they exist.
    """
    try:
        # Get user_id from auth middleware (set by @require_auth)
        user_id = request.user_id

        preferences = personalization_service.load_preferences(user_id)

        if not preferences:
            return jsonify({
                'exists': False,
                'message': f'No preferences found for user {user_id}'
            })

        return jsonify({
            'exists': True,
            'preferences': preferences.model_dump(),
            'last_analyzed': preferences.last_analyzed,
            'events_analyzed': preferences.total_events_analyzed
        })

    except Exception as e:
        return jsonify({'error': f'Failed to get preferences: {str(e)}'}), 500


@app.route('/api/personalization/preferences', methods=['DELETE'])
@require_auth
def delete_preferences():
    """
    Delete the authenticated user's preferences.

    Requires authentication. User ID is extracted from JWT token.
    """
    try:
        # Get user_id from auth middleware (set by @require_auth)
        user_id = request.user_id

        success = personalization_service.delete_preferences(user_id)

        if success:
            return jsonify({
                'success': True,
                'message': f'Preferences deleted for user {user_id}'
            })
        else:
            return jsonify({
                'success': False,
                'message': f'No preferences to delete for user {user_id}'
            }), 404

    except Exception as e:
        return jsonify({'error': f'Failed to delete preferences: {str(e)}'}), 500


@app.route('/api/personalization/discover', methods=['POST'])
@require_auth
def discover_patterns():
    """
    Discover user's formatting patterns from calendar history.

    Uses the new simplified approach:
    - Statistical analysis for style patterns
    - LLM-based calendar and color pattern summaries
    - Stores patterns for use by Agent 5

    Requires authentication. User ID is extracted from JWT token.

    Expects JSON body:
    {
        "max_events": 500  # Optional, default 500
    }

    Returns discovered patterns.
    """
    try:
        # Get user_id from auth middleware (set by @require_auth)
        user_id = request.user_id

        data = request.get_json() or {}
        max_events = data.get('max_events', 500)

        # Step 1: Collect comprehensive calendar data
        print(f"\n{'='*60}")
        print(f"PATTERN DISCOVERY for user {user_id}")
        print(f"{'='*60}")

        # Set PostHog tracking context
        set_tracking_context(distinct_id=user_id, trace_id=f"discover-{uuid.uuid4().hex[:8]}")

        comprehensive_data = data_collection_service.collect_comprehensive_data(
            user_id=user_id,
            max_events=max_events
        )

        events_count = len(comprehensive_data.get('events', []))

        if events_count < 10:
            return jsonify({
                'success': False,
                'error': f'Need at least 10 events to discover patterns. Found {events_count}.'
            }), 400

        # Step 2: Discover patterns
        patterns = pattern_discovery_service.discover_patterns(
            comprehensive_data=comprehensive_data,
            user_id=user_id
        )

        # Step 3: Save patterns
        success = personalization_service.save_patterns(patterns)

        if not success:
            return jsonify({
                'success': False,
                'error': 'Failed to save patterns'
            }), 500

        return jsonify({
            'success': True,
            'patterns': patterns,
            'events_analyzed': patterns['total_events_analyzed'],
            'message': f'Successfully discovered patterns from {events_count} events'
        })

    except Exception as e:
        print(f"Error in pattern discovery: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Pattern discovery failed: {str(e)}'}), 500


@app.route('/api/personalization/patterns', methods=['GET'])
@require_auth
def get_patterns():
    """
    Get the authenticated user's discovered patterns.

    Requires authentication. User ID is extracted from JWT token.

    Returns discovered patterns if they exist.
    """
    try:
        # Get user_id from auth middleware (set by @require_auth)
        user_id = request.user_id

        patterns = personalization_service.load_patterns(user_id)

        if not patterns:
            return jsonify({
                'exists': False,
                'message': f'No patterns found for user {user_id}. Run pattern discovery first.'
            }), 404

        return jsonify({
            'exists': True,
            'patterns': patterns,
            'last_updated': patterns.get('last_updated'),
            'events_analyzed': patterns.get('total_events_analyzed', 0)
        })

    except Exception as e:
        return jsonify({'error': f'Failed to get patterns: {str(e)}'}), 500


@app.route('/api/personalization/patterns', methods=['DELETE'])
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

        if success:
            return jsonify({
                'success': True,
                'message': f'Patterns deleted for user {user_id}'
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

@app.route('/api/sessions', methods=['POST'])
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

        if len(input_text) > ProcessingConfig.MAX_TEXT_INPUT_LENGTH:
            return jsonify({
                'error': ProcessingConfig.get_text_limit_error_message(len(input_text)),
                'error_type': 'input_too_large'
            }), 413

        # Create session in database
        session = DBSession.create(
            user_id=user_id,
            input_type='text',
            input_content=input_text
        )

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


@app.route('/api/upload', methods=['POST'])
@require_auth
def upload_file_endpoint():
    """
    Upload an image or audio file and create a session.

    Requires authentication. User ID is extracted from JWT token.

    Expects multipart/form-data with:
    - file: The file to upload
    - type: 'image' or 'audio'

    Returns the created session object with file path.
    """
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        file_type = request.form.get('type', 'image')  # 'image' or 'audio'

        # Get user_id from auth middleware (set by @require_auth)
        user_id = request.user_id

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Validate file type
        if not FileStorage.validate_file_type(file.content_type, file_type):
            return jsonify({
                'error': f'Invalid file type. Expected {file_type}, got {file.content_type}'
            }), 400

        # Upload to Supabase Storage
        file_path = FileStorage.upload_file(
            file=file,
            filename=file.filename,
            user_id=user_id,
            file_type=file_type
        )

        # Create session in database
        session = DBSession.create(
            user_id=user_id,
            input_type=file_type,
            input_content=file_path
        )

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


@app.route('/api/sessions/<session_id>', methods=['GET'])
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


@app.route('/api/sessions/<session_id>/events', methods=['GET'])
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

        # Try events table first (new path)
        events = EventService.get_events_by_session(session_id)

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


@app.route('/api/sessions', methods=['GET'])
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
        limit = int(request.args.get('limit', 50))

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

@app.route('/api/sessions/guest', methods=['POST'])
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


@app.route('/api/upload/guest', methods=['POST'])
@limiter.limit("10 per hour")
def upload_guest_file():
    """
    Upload an image or audio file as guest (no authentication required).

    Allows users to process up to 3 sessions before requiring sign-in.
    Rate limited to 10 requests per hour per IP address.

    Expects multipart/form-data with:
    - file: The file to upload
    - input_type: 'image' or 'audio'

    Returns the created session object with guest_mode=True and file path.
    """
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        file_type = request.form.get('input_type', 'image')  # 'image' or 'audio'

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Validate file type
        if not FileStorage.validate_file_type(file.content_type, file_type):
            return jsonify({
                'error': f'Invalid file type. Expected {file_type}, got {file.content_type}'
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

        # Create session in database with guest_mode=True
        session = DBSession.create(
            user_id=guest_id,
            input_type=file_type,
            input_content=file_path,
            guest_mode=True
        )

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


@app.route('/api/sessions/guest/<session_id>', methods=['GET'])
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


@app.route('/api/sessions/guest/<session_id>/events', methods=['GET'])
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

        # Try events table first
        events = EventService.get_events_by_session(session_id)

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

@app.route('/api/scrape-url', methods=['POST'])
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
