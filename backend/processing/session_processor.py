"""
Session processor for running AI pipeline on sessions.
Connects the existing LangChain agents to the session workflow.
"""

from typing import Optional
import os
import threading
from database.models import Session as DBSession, Event
from processors.factory import InputProcessorFactory, InputType
from extraction.agents.identification import EventIdentificationAgent
from extraction.agents.facts import FactExtractionAgent
from extraction.agents.formatting import CalendarFormattingAgent
from extraction.agents.standard_formatting import StandardFormattingAgent
from extraction.title_generator import get_title_generator
from events.service import EventService


class SessionProcessor:
    """Processes sessions through the full AI pipeline."""

    # Threshold for "minimal history" (events needed before using personalized formatting)
    MIN_HISTORY_THRESHOLD = 10

    def __init__(self, llm, input_processor_factory: InputProcessorFactory):
        """
        Initialize the session processor with agents.

        Args:
            llm: LangChain LLM instance for agents
            input_processor_factory: Factory for processing files
        """
        self.llm = llm
        self.input_processor_factory = input_processor_factory

        # Initialize all agents
        self.agent_1_identification = EventIdentificationAgent(llm)
        self.agent_2_extraction = FactExtractionAgent(llm)
        self.agent_3_formatting = CalendarFormattingAgent(llm)
        self.agent_3_standard_formatting = StandardFormattingAgent(llm)

        # Initialize title generator
        self.title_generator = get_title_generator()

    def _should_use_standard_formatting(self, session: dict) -> bool:
        """
        Determine if we should use standard formatting agent.

        Uses standard formatting for:
        1. Guest sessions (guest_mode=True)
        2. Users with minimal calendar history (< MIN_HISTORY_THRESHOLD events)

        Args:
            session: Session dictionary from database

        Returns:
            True if standard formatting should be used
        """
        # Check if guest session
        if session.get('guest_mode'):
            return True

        # Check user's event history
        user_id = session['user_id']
        try:
            event_count = Event.count_user_events(user_id)
            if event_count < self.MIN_HISTORY_THRESHOLD:
                print(f"Using standard formatting: User has only {event_count} events (threshold: {self.MIN_HISTORY_THRESHOLD})")
                return True
        except Exception as e:
            print(f"Error checking event count: {e}. Defaulting to standard formatting.")
            return False

        return False

    def _generate_and_update_title(self, session_id: str, text: str, metadata: dict = None) -> None:
        """
        Generate title asynchronously and update session.
        Runs in background thread.

        Args:
            session_id: Session ID to update
            text: Input text for title generation
            metadata: Optional metadata for vision inputs
        """
        try:
            # Generate title
            title = self.title_generator.generate(text, max_words=3, vision_metadata=metadata)

            # Update session with title
            DBSession.update_title(session_id, title)

            print(f"✓ Title generated for session {session_id}: '{title}'")
        except Exception as e:
            print(f"Error generating title for session {session_id}: {e}")
            # Don't fail the entire session if title generation fails
            # Just leave it without a title

    def process_text_session(self, session_id: str, text: str) -> None:
        """
        Process a text session through the full AI pipeline.

        Args:
            session_id: ID of the session to process
            text: Input text to process
        """
        try:
            # Update status to processing
            DBSession.update_status(session_id, 'processing')

            # Launch title generation in background (runs in parallel with pipeline)
            title_thread = threading.Thread(
                target=self._generate_and_update_title,
                args=(session_id, text, {}),
                daemon=True
            )
            title_thread.start()

            # Step 1: Event Identification
            identification_result = self.agent_1_identification.execute(
                text,
                {},
                requires_vision=False
            )

            # Check if any events were found
            if not identification_result.has_events:
                # No events found - mark as processed with empty events
                DBSession.update_processed_events(session_id, [])
                return

            # Save extracted events
            extracted_events = [
                {
                    'raw_text': event.raw_text,
                    'description': event.description
                }
                for event in identification_result.events
            ]
            DBSession.update_extracted_events(session_id, extracted_events)

            # Step 3: Process each event (Fact Extraction + Formatting)
            # Get session to access user_id and determine formatting agent
            session = DBSession.get_by_id(session_id)
            user_id = session['user_id']

            # Determine which formatting agent to use
            use_standard_formatting = self._should_use_standard_formatting(session)
            formatting_agent = (
                self.agent_3_standard_formatting if use_standard_formatting
                else self.agent_3_formatting
            )

            agent_type = "standard" if use_standard_formatting else "personalized"
            print(f"Using {agent_type} formatting agent for session {session_id}")

            for event in identification_result.events:
                # Agent 2: Fact Extraction
                facts = self.agent_2_extraction.execute(
                    event.raw_text,
                    event.description
                )

                # Agent 3: Calendar Formatting (standard or personalized)
                calendar_event = formatting_agent.execute(facts)

                # Create event in unified events table
                EventService.create_dropcal_event(
                    user_id=user_id,
                    session_id=session_id,
                    summary=calendar_event.summary,
                    start_time=calendar_event.start.get('dateTime') if calendar_event.start else None,
                    end_time=calendar_event.end.get('dateTime') if calendar_event.end else None,
                    start_date=calendar_event.start.get('date') if calendar_event.start else None,
                    end_date=calendar_event.end.get('date') if calendar_event.end else None,
                    is_all_day=calendar_event.start.get('date') is not None if calendar_event.start else False,
                    description=calendar_event.description,
                    location=calendar_event.location,
                    calendar_name=calendar_event.calendar,
                    color_id=calendar_event.colorId,
                    original_input=event.raw_text,
                    extracted_facts=facts.model_dump(),
                    system_suggestion=calendar_event.model_dump()
                )

            # Mark session as complete
            DBSession.update_status(session_id, 'processed')

        except Exception as e:
            # Mark session as error
            error_message = str(e)
            print(f"Error processing session {session_id}: {error_message}")
            DBSession.mark_error(session_id, error_message)

    def process_file_session(
        self,
        session_id: str,
        file_path: str,
        file_type: str
    ) -> None:
        """
        Process a file session through the full AI pipeline.

        Args:
            session_id: ID of the session to process
            file_path: Path to the uploaded file (in Supabase storage)
            file_type: Type of file ('image', 'audio', 'pdf')
        """
        try:
            # Update status to processing
            DBSession.update_status(session_id, 'processing')

            # For files stored in Supabase, we need to download them first
            # For now, if it's a Supabase URL, we'll handle it as-is
            # The processor can handle URLs directly for images

            # Determine if vision is needed
            requires_vision = file_type in ['image', 'pdf']

            # For audio files, we need the actual file path
            # For now, we'll extract text from the file path/URL
            if file_type == 'audio':
                # Audio files need to be processed to extract text
                # This is a simplified version - in production, download from Supabase first
                text = f"[Audio file content from {file_path}]"
                metadata = {'source': 'audio', 'file_path': file_path}
            elif file_type == 'image':
                # Images can be processed with vision
                text = f"[Image file at {file_path}]"
                metadata = {'source': 'image', 'file_path': file_path, 'requires_vision': True}
            else:
                # Default text extraction
                text = file_path
                metadata = {'source': file_type, 'file_path': file_path}

            # Launch title generation in background (runs in parallel with pipeline)
            title_thread = threading.Thread(
                target=self._generate_and_update_title,
                args=(session_id, text, metadata),
                daemon=True
            )
            title_thread.start()

            # Step 1: Event Identification
            identification_result = self.agent_1_identification.execute(
                text,
                metadata,
                requires_vision
            )

            # Check if any events were found
            if not identification_result.has_events:
                # No events found
                DBSession.update_processed_events(session_id, [])
                return

            # Save extracted events
            extracted_events = [
                {
                    'raw_text': event.raw_text,
                    'description': event.description
                }
                for event in identification_result.events
            ]
            DBSession.update_extracted_events(session_id, extracted_events)

            # Step 3: Process each event
            # Get session to access user_id and determine formatting agent
            session = DBSession.get_by_id(session_id)
            user_id = session['user_id']

            # Determine which formatting agent to use
            use_standard_formatting = self._should_use_standard_formatting(session)
            formatting_agent = (
                self.agent_3_standard_formatting if use_standard_formatting
                else self.agent_3_formatting
            )

            agent_type = "standard" if use_standard_formatting else "personalized"
            print(f"Using {agent_type} formatting agent for session {session_id}")

            for event in identification_result.events:
                # Agent 2: Fact Extraction
                facts = self.agent_2_extraction.execute(
                    event.raw_text,
                    event.description
                )

                # Agent 3: Calendar Formatting (standard or personalized)
                calendar_event = formatting_agent.execute(facts)

                # Create event in unified events table
                EventService.create_dropcal_event(
                    user_id=user_id,
                    session_id=session_id,
                    summary=calendar_event.summary,
                    start_time=calendar_event.start.get('dateTime') if calendar_event.start else None,
                    end_time=calendar_event.end.get('dateTime') if calendar_event.end else None,
                    start_date=calendar_event.start.get('date') if calendar_event.start else None,
                    end_date=calendar_event.end.get('date') if calendar_event.end else None,
                    is_all_day=calendar_event.start.get('date') is not None if calendar_event.start else False,
                    description=calendar_event.description,
                    location=calendar_event.location,
                    calendar_name=calendar_event.calendar,
                    color_id=calendar_event.colorId,
                    original_input=event.raw_text,
                    extracted_facts=facts.model_dump(),
                    system_suggestion=calendar_event.model_dump()
                )

            # Mark session as complete
            DBSession.update_status(session_id, 'processed')

        except Exception as e:
            # Mark session as error
            error_message = str(e)
            print(f"Error processing file session {session_id}: {error_message}")
            DBSession.mark_error(session_id, error_message)
