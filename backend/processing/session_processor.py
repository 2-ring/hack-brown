"""
Session processor for running AI pipeline on sessions.
Connects the existing LangChain agents to the session workflow.
"""

from typing import Optional
import os
import logging
import threading
import traceback
from database.models import Session as DBSession, Event
from processors.factory import InputProcessorFactory, InputType
from extraction.agents.identification import EventIdentificationAgent
from extraction.agents.facts import EventExtractionAgent
from preferences.agent import PersonalizationAgent
from extraction.title_generator import get_title_generator
from events.service import EventService
from preferences.service import PersonalizationService
from processing.parallel import process_events_parallel, EventProcessingResult
from config.posthog import set_tracking_context

logger = logging.getLogger(__name__)


class SessionProcessor:
    """Processes sessions through the full AI pipeline."""

    def __init__(self, llm, input_processor_factory: InputProcessorFactory, llm_personalization=None):
        """
        Initialize the session processor with agents.

        Args:
            llm: LangChain LLM instance for agents
            input_processor_factory: Factory for processing files
            llm_personalization: Optional separate LLM for personalization agent
        """
        self.llm = llm
        self.input_processor_factory = input_processor_factory

        # Initialize agents
        self.agent_1_identification = EventIdentificationAgent(llm)
        self.agent_2_extraction = EventExtractionAgent(llm)
        self.agent_3_personalization = PersonalizationAgent(llm_personalization or llm)

        # Services
        self.personalization_service = PersonalizationService()

        # Initialize title generator
        self.title_generator = get_title_generator()

    def _get_user_timezone(self, user_id: str) -> str:
        """Get user's timezone from their profile, default to America/New_York."""
        try:
            from database.models import User
            user = User.get_by_id(user_id)
            if user and user.get('timezone'):
                return user['timezone']
        except Exception as e:
            logger.warning(f"Could not fetch user timezone: {e}")
        return 'America/New_York'

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

    def _load_personalization_context(self, user_id: str, is_guest: bool):
        """
        Load personalization context for a user (once per session).

        Returns (patterns, historical_events) or (None, None) if not available.
        """
        if is_guest:
            return None, None

        try:
            patterns = self.personalization_service.load_patterns(user_id)
            if not patterns:
                return None, None

            historical_events = EventService.get_historical_events_with_embeddings(
                user_id=user_id,
                limit=200
            )
            return patterns, historical_events
        except Exception as e:
            logger.warning(f"Could not load personalization context: {e}")
            return None, None

    def _process_events_for_session(
        self,
        session_id: str,
        user_id: str,
        events: list,
        timezone: str,
        is_guest: bool = False,
    ) -> None:
        """
        Process identified events in parallel and write to DB.

        Shared by process_text_session and process_file_session.

        Args:
            session_id: Session ID for DB writes
            user_id: User ID for event ownership
            events: List of IdentifiedEvent objects from Agent 1
            timezone: User's IANA timezone
            is_guest: Whether this is a guest session
        """
        # Load personalization context once for the session
        patterns, historical_events = self._load_personalization_context(user_id, is_guest)
        use_personalization = patterns is not None

        if use_personalization:
            logger.info(f"Session {session_id}: Using personalization (Agent 3)")
        else:
            logger.info(f"Session {session_id}: Skipping personalization")

        # Lock for thread-safe DB writes (Session.add_event does read-modify-write)
        db_lock = threading.Lock()

        def process_single_event(idx, event):
            try:
                # Agent 2: Extract facts and produce calendar event
                calendar_event = self.agent_2_extraction.execute(
                    event.raw_text,
                    event.description,
                    timezone=timezone
                )

                # Agent 3: Personalize (if patterns available)
                if use_personalization:
                    calendar_event = self.agent_3_personalization.execute(
                        event=calendar_event,
                        discovered_patterns=patterns,
                        historical_events=historical_events,
                        user_id=user_id
                    )

                # DB write with lock to avoid race condition on event_ids
                with db_lock:
                    EventService.create_dropcal_event(
                        user_id=user_id,
                        session_id=session_id,
                        summary=calendar_event.summary,
                        start_time=calendar_event.start.dateTime,
                        end_time=calendar_event.end.dateTime,
                        start_date=calendar_event.start.date,
                        end_date=calendar_event.end.date,
                        is_all_day=calendar_event.start.date is not None,
                        description=calendar_event.description,
                        location=calendar_event.location,
                        calendar_name=calendar_event.calendar,
                        color_id=calendar_event.colorId,
                        original_input=event.raw_text,
                        extracted_facts=calendar_event.model_dump(),
                        system_suggestion=calendar_event.model_dump()
                    )

                return EventProcessingResult(
                    index=idx, success=True,
                    calendar_event=calendar_event
                )

            except Exception as e:
                logger.error(
                    f"Error processing event {idx+1} in session {session_id}: "
                    f"{e}\n{traceback.format_exc()}"
                )
                return EventProcessingResult(
                    index=idx, success=False,
                    warning=f"Event {idx+1}: {str(e)}",
                    error=e,
                )

        batch_result = process_events_parallel(
            events=events,
            process_single_event=process_single_event,
        )

        if batch_result.warnings:
            logger.warning(
                f"Session {session_id}: {len(batch_result.warnings)} event(s) "
                f"had issues: {batch_result.warnings}"
            )

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

            # Set PostHog tracking for this background thread
            session = DBSession.get_by_id(session_id)
            set_tracking_context(
                distinct_id=session.get('user_id', 'anonymous') if session else 'anonymous',
                trace_id=session_id
            )

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

            # Step 2: Process events (extraction → optional personalization → DB)
            session = DBSession.get_by_id(session_id)
            user_id = session['user_id']
            is_guest = session.get('guest_mode', False)
            timezone = self._get_user_timezone(user_id)

            self._process_events_for_session(
                session_id=session_id,
                user_id=user_id,
                events=identification_result.events,
                timezone=timezone,
                is_guest=is_guest,
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

            # Set PostHog tracking for this background thread
            session_data = DBSession.get_by_id(session_id)
            set_tracking_context(
                distinct_id=session_data.get('user_id', 'anonymous') if session_data else 'anonymous',
                trace_id=session_id
            )

            # Determine if vision is needed
            requires_vision = file_type in ['image', 'pdf']

            if file_type == 'audio':
                text = f"[Audio file content from {file_path}]"
                metadata = {'source': 'audio', 'file_path': file_path}
            elif file_type == 'image':
                text = f"[Image file at {file_path}]"
                metadata = {'source': 'image', 'file_path': file_path, 'requires_vision': True}
            else:
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

            # Step 2: Process events (extraction → optional personalization → DB)
            session = DBSession.get_by_id(session_id)
            user_id = session['user_id']
            is_guest = session.get('guest_mode', False)
            timezone = self._get_user_timezone(user_id)

            self._process_events_for_session(
                session_id=session_id,
                user_id=user_id,
                events=identification_result.events,
                timezone=timezone,
                is_guest=is_guest,
            )

            # Mark session as complete
            DBSession.update_status(session_id, 'processed')

        except Exception as e:
            # Mark session as error
            error_message = str(e)
            print(f"Error processing file session {session_id}: {error_message}")
            DBSession.mark_error(session_id, error_message)
