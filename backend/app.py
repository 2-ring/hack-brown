from flask import Flask, jsonify, request
from flask_cors import CORS
from langchain_anthropic import ChatAnthropic
from dotenv import load_dotenv
import os
from werkzeug.utils import secure_filename
from typing import Optional

from utils.input_processor import InputProcessorFactory, InputType
from backend.processors.audio import AudioProcessor
from backend.processors.image import ImageProcessor
from backend.processors.text import TextFileProcessor
from backend.processors.pdf import PDFProcessor
from services.calendar_service import CalendarService
from utils.logging_utils import app_logger
from services.personalization_service import PersonalizationService
from models.user_preferences import UserPreferences

# Import agent modules
from agents import (
    ContextUnderstandingAgent,
    EventIdentificationAgent,
    FactExtractionAgent,
    CalendarFormattingAgent,
    EventModificationAgent,
    PreferenceApplicationAgent
)

# Import models
from models import ExtractedFacts

# Import route blueprints
from routes import calendar_bp

load_dotenv()

app = Flask(__name__)
CORS(app)

# Register blueprints
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
        app_logger.error(f"Event extraction pipeline failed: {str(e)}")
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
        app_logger.error(f"Event modification endpoint failed: {str(e)}")
        return jsonify({'error': f'Event modification failed: {str(e)}'}), 500


# ============================================================================
# Personalization Endpoints
# ============================================================================

@app.route('/api/personalization/apply', methods=['POST'])
def apply_preferences_endpoint():
    """
    Agent 5: Apply user preferences to extracted facts.

    Expects JSON body:
    {
        "facts": {...},  # Extracted facts from Agent 2
        "user_id": "default"  # Optional user ID
    }

    Returns enhanced facts with user preferences applied.
    """
    try:
        data = request.get_json()
        facts_dict = data.get('facts')
        user_id = data.get('user_id', 'default')

        if not facts_dict:
            return jsonify({'error': 'No facts provided'}), 400

        # Load user preferences
        preferences = personalization_service.load_preferences(user_id)

        if not preferences:
            # No preferences, return facts unchanged
            app_logger.info(f"No preferences for user {user_id}, returning facts unchanged")
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
        app_logger.error(f"Preference application failed: {str(e)}")
        return jsonify({'error': f'Preference application failed: {str(e)}'}), 500


@app.route('/api/personalization/preferences/<user_id>', methods=['GET'])
def get_preferences(user_id):
    """
    Get user's saved preferences.

    Returns user preferences if they exist.
    """
    try:
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


@app.route('/api/personalization/preferences/<user_id>', methods=['DELETE'])
def delete_preferences(user_id):
    """
    Delete user's preferences.
    """
    try:
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

if __name__ == '__main__':
    app.run(debug=True, port=5000)
