from flask import Flask, jsonify, request
from flask_cors import CORS
from langchain_anthropic import ChatAnthropic
from dotenv import load_dotenv
import os
import threading
from werkzeug.utils import secure_filename
from typing import Optional

from processors.factory import InputProcessorFactory, InputType
from processors.audio import AudioProcessor
from processors.image import ImageProcessor
from processors.text import TextFileProcessor
from processors.pdf import PDFProcessor
from calendars.service import CalendarService
from preferences.service import PersonalizationService
from preferences.models import UserPreferences

# Database and Storage imports
from database.models import User, Session as DBSession
from storage.file_handler import FileStorage

# Import agent modules
from extraction.agents.context import ContextUnderstandingAgent
from extraction.agents.identification import EventIdentificationAgent
from extraction.agents.facts import FactExtractionAgent
from extraction.agents.formatting import CalendarFormattingAgent
from modification.agent import EventModificationAgent
from preferences.agent import PreferenceApplicationAgent

# Import models
from extraction.models import ExtractedFacts

# Import route blueprints
from calendar import calendar_bp
from auth.routes import auth_bp

# Import auth middleware
from auth.middleware import require_auth

# Import session processor
from processing.session_processor import SessionProcessor

load_dotenv()

app = Flask(__name__)
CORS(app)

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(calendar_bp)

# Configure upload folder
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024  # 25MB max file size

llm = ChatAnthropic(model="claude-sonnet-4-5-20250929", api_key=os.getenv("ANTHROPIC_API_KEY"))

# Initialize Google Calendar service
calendar_service = CalendarService()

# Initialize Personalization service
personalization_service = PersonalizationService()

# Initialize Agents
agent_0_context = ContextUnderstandingAgent(llm)
agent_1_identification = EventIdentificationAgent(llm)
agent_2_extraction = FactExtractionAgent(llm)
agent_3_formatting = CalendarFormattingAgent(llm)
agent_4_modification = EventModificationAgent(llm)
agent_5_preferences = PreferenceApplicationAgent(llm)

# Initialize input processor factory and register all processors
input_processor_factory = InputProcessorFactory()

# Register audio processor
audio_processor = AudioProcessor(api_key=os.getenv('OPENAI_API_KEY'))
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
session_processor = SessionProcessor(llm, input_processor_factory)


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

    Runs full agent pipeline: Context → Identification → Extraction → Formatting

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

    # Step 2: Run full agent pipeline
    try:
        # Agent 0: Context Understanding
        context_result = agent_0_context.execute(raw_input, metadata, requires_vision)

        # Agent 1: Event Identification
        identification_result = agent_1_identification.execute(
            raw_input,
            metadata,
            context_result.model_dump(),
            requires_vision
        )

        # Check if any events were found
        if not identification_result.has_events:
            return jsonify({
                'success': True,
                'session_title': context_result.session_title,
                'events': [],
                'message': 'No calendar events found in input'
            })

        # Step 3: Extract and format each event
        formatted_events = []
        for event in identification_result.events:
            # Agent 2: Fact Extraction
            facts = agent_2_extraction.execute(
                event.raw_text,
                event.description
            )

            # Agent 3: Calendar Formatting
            calendar_event = agent_3_formatting.execute(facts)
            formatted_events.append(calendar_event.model_dump())

        # Return results
        return jsonify({
            'success': True,
            'session_title': context_result.session_title,
            'user_context': context_result.user_context.model_dump(),
            'num_events': len(formatted_events),
            'events': formatted_events
        })

    except Exception as e:
        return jsonify({'error': f'Event extraction failed: {str(e)}'}), 500


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
        # Use the Event Modification Agent
        result = agent_4_modification.execute(original_event, edit_instruction)

        # Convert Pydantic model to dict for JSON response
        return jsonify({
            'success': True,
            'modified_event': result.model_dump()
        })

    except Exception as e:
        return jsonify({'error': f'Event modification failed: {str(e)}'}), 500


# ============================================================================
# Personalization Endpoints
# ============================================================================

@app.route('/api/personalization/apply', methods=['POST'])
@require_auth
def apply_preferences_endpoint():
    """
    Agent 5: Apply user preferences to extracted facts.

    Requires authentication. User ID is extracted from JWT token.

    Expects JSON body:
    {
        "facts": {...}  # Extracted facts from Agent 2
    }

    Returns enhanced facts with user preferences applied.
    """
    try:
        data = request.get_json()
        facts_dict = data.get('facts')

        # Get user_id from auth middleware (set by @require_auth)
        user_id = request.user_id

        if not facts_dict:
            return jsonify({'error': 'No facts provided'}), 400

        # Load user preferences
        preferences = personalization_service.load_preferences(user_id)

        if not preferences:
            # No preferences, return facts unchanged
            return jsonify({
                'enhanced_facts': facts_dict,
                'preferences_applied': False,
                'message': 'No user preferences found. Run analysis first.'
            })

        # Convert dict to ExtractedFacts model
        facts = ExtractedFacts(**facts_dict)

        # Use the Preference Application Agent
        enhanced_facts = agent_5_preferences.execute(facts, preferences)

        return jsonify({
            'enhanced_facts': enhanced_facts.model_dump(),
            'preferences_applied': True,
            'user_id': user_id,
            'events_analyzed': preferences.total_events_analyzed
        })

    except Exception as e:
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
            }), 404

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


if __name__ == '__main__':
    app.run(debug=True, port=5000)
