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
from processing.chunked_identification import identify_events_chunked
from config.posthog import (
    set_tracking_context, flush_posthog, capture_agent_error,
    capture_pipeline_trace, capture_phase_span, get_tracking_property,
)
import time as _time

logger = logging.getLogger(__name__)


class SessionProcessor:
    """Processes sessions through the full AI pipeline."""

    def __init__(self, llm, input_processor_factory: InputProcessorFactory, llm_personalization=None, pattern_refresh_service=None, llm_light=None, llm_personalization_light=None):
        """
        Initialize the session processor with agents.

        Args:
            llm: LangChain LLM instance for agents
            input_processor_factory: Factory for processing files
            llm_personalization: Optional separate LLM for personalization agent
            pattern_refresh_service: Optional PatternRefreshService for incremental refresh
            llm_light: Optional lightweight LLM for simple inputs
            llm_personalization_light: Optional lightweight LLM for personalization on simple inputs
        """
        self.llm = llm
        self.input_processor_factory = input_processor_factory

        # Standard agents
        self.agent_1_identification = EventIdentificationAgent(llm)
        self.agent_2_extraction = EventExtractionAgent(llm)
        self.agent_3_personalization = PersonalizationAgent(llm_personalization or llm)

        # Light agents (for simple inputs)
        if llm_light:
            self.agent_1_identification_light = EventIdentificationAgent(llm_light)
            self.agent_2_extraction_light = EventExtractionAgent(llm_light)
            self.agent_3_personalization_light = PersonalizationAgent(llm_personalization_light or llm_light)
            self.has_light_agents = True
        else:
            self.has_light_agents = False

        # Services
        self.personalization_service = PersonalizationService()
        self.pattern_refresh_service = pattern_refresh_service

        # Initialize title generator
        self.title_generator = get_title_generator()

    def _convert_document(self, file_path: str) -> str:
        """
        Download a document from Supabase storage and convert to text
        using markitdown. Returns the extracted text.
        """
        import tempfile
        from storage.file_handler import FileStorage
        from markitdown import MarkItDown

        # Download file bytes from Supabase
        file_bytes = FileStorage.download_file(file_path)

        # Write to temp file (markitdown needs a file path)
        ext = os.path.splitext(file_path)[1] or '.docx'
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            md = MarkItDown()
            result = md.convert(tmp_path)
            text = result.text_content

            if not text or not text.strip():
                raise ValueError("No text content could be extracted from the document")

            logger.info(f"Document converted: {file_path} → {len(text)} chars")
            return text
        finally:
            os.unlink(tmp_path)

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
            from config.limits import TextLimits
            title = self.title_generator.generate(text, max_words=TextLimits.SESSION_TITLE_MAX_WORDS, vision_metadata=metadata)

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
            # load_patterns reads style_stats from users.preferences
            # and calendar patterns from the calendars table
            patterns = self.personalization_service.load_patterns(user_id)
            if not patterns:
                return None, None

            # Trigger background refresh check (non-blocking)
            if self.pattern_refresh_service:
                self.pattern_refresh_service.maybe_refresh(user_id)

            from config.database import QueryLimits
            historical_events = EventService.get_historical_events_with_embeddings(
                user_id=user_id,
                limit=QueryLimits.PERSONALIZATION_HISTORICAL_LIMIT
            )
            return patterns, historical_events
        except Exception as e:
            logger.warning(f"Could not load personalization context: {e}")
        except Exception as e:
            logger.warning(f"Failed to migrate patterns to DB: {e}")

    def _select_agents(self, text: str, input_type: str = 'text', metadata: dict = None):
        """
        Select agent tier (light vs standard) based on input complexity.

        Returns:
            tuple: (agent_1, agent_2, agent_3, complexity_result)
        """
        from config.complexity import InputComplexityAnalyzer, ComplexityLevel

        if not self.has_light_agents:
            return (self.agent_1_identification, self.agent_2_extraction, self.agent_3_personalization, None)

        result = InputComplexityAnalyzer.analyze(text, input_type, metadata)

        if result.level == ComplexityLevel.SIMPLE:
            logger.info(f"Complexity: SIMPLE ({result.reason}) -> using light models")
            return (self.agent_1_identification_light, self.agent_2_extraction_light, self.agent_3_personalization_light, result)
        else:
            logger.info(f"Complexity: COMPLEX ({result.reason}) -> using standard models")
            return (self.agent_1_identification, self.agent_2_extraction, self.agent_3_personalization, result)

    def _process_events_for_session(
        self,
        session_id: str,
        user_id: str,
        events: list,
        timezone: str,
        is_guest: bool = False,
        agent_2: EventExtractionAgent = None,
        agent_3: PersonalizationAgent = None,
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
            agent_2: Extraction agent to use (defaults to standard)
            agent_3: Personalization agent to use (defaults to standard)
        """
        # Fall back to standard agents if not specified
        agent_2 = agent_2 or self.agent_2_extraction
        agent_3 = agent_3 or self.agent_3_personalization

        # Load personalization context once for the session
        patterns, historical_events = self._load_personalization_context(user_id, is_guest)
        use_personalization = patterns is not None

        # Update thread-local so pipeline trace and downstream agents know
        set_tracking_context(has_personalization=use_personalization)

        if use_personalization:
            logger.info(f"Session {session_id}: Using personalization (Agent 3)")
        else:
            logger.info(f"Session {session_id}: Skipping personalization")

        # Lock for thread-safe DB writes (Session.add_event does read-modify-write)
        db_lock = threading.Lock()

        # Capture parent thread context to propagate to worker threads
        _parent_input_type = get_tracking_property('input_type')
        _parent_pipeline = get_tracking_property('pipeline')

        def process_single_event(idx, event):
            # Propagate tracking context to this worker thread + set event_index
            set_tracking_context(
                distinct_id=user_id,
                trace_id=session_id,
                pipeline=_parent_pipeline,
                input_type=_parent_input_type,
                is_guest=is_guest,
                num_events=len(events),
                has_personalization=use_personalization,
                event_index=idx,
            )
            try:
                # Agent 2: Extract facts and produce calendar event
                calendar_event = agent_2.execute(
                    event.raw_text,
                    event.description,
                    timezone=timezone
                )

                # Agent 3: Personalize (if patterns available)
                if use_personalization:
                    calendar_event = agent_3.execute(
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
                        calendar_name=calendar_event.calendar,  # provider calendar ID (DB column is named calendar_name)
                        color_id=calendar_event.colorId,
                        original_input=event.raw_text,
                        extracted_facts=calendar_event.model_dump(),
                        system_suggestion=calendar_event.model_dump(),
                        recurrence=calendar_event.recurrence,
                        attendees=calendar_event.attendees
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
                capture_agent_error("extraction", e, {
                    'session_id': session_id,
                    'event_index': idx,
                })
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
        input_type = 'text'
        is_guest = False
        pipeline_start = _time.time()

        try:
            # Update status to processing
            DBSession.update_status(session_id, 'processing')

            # Set PostHog tracking for this background thread
            session = DBSession.get_by_id(session_id)
            is_guest = session.get('guest_mode', False) if session else False
            user_id = session.get('user_id', 'anonymous') if session else 'anonymous'
            pipeline_label = f"Session: text{' (guest)' if is_guest else ''}"

            set_tracking_context(
                distinct_id=user_id,
                trace_id=session_id,
                pipeline=pipeline_label,
                input_type=input_type,
                is_guest=is_guest,
            )

            # Select agents based on input complexity
            agent_1, agent_2, agent_3, complexity = self._select_agents(text, input_type='text')

            # Launch title generation in background (runs in parallel with pipeline)
            title_thread = threading.Thread(
                target=self._generate_and_update_title,
                args=(session_id, text, {}),
                daemon=True
            )
            title_thread.start()

            # Phase 1: Event Identification (with chunking for large inputs)
            phase1_start = _time.time()
            identification_result = identify_events_chunked(
                agent=agent_1,
                raw_input=text,
                metadata={},
                requires_vision=False,
                tracking_context={
                    'distinct_id': user_id,
                    'trace_id': session_id,
                    'pipeline': pipeline_label,
                    'input_type': input_type,
                    'is_guest': is_guest,
                },
            )
            phase1_ms = (_time.time() - phase1_start) * 1000

            capture_phase_span(
                'identification', session_id, phase1_ms,
                outcome='success' if identification_result.has_events else 'no_events',
                properties={
                    'num_events_found': identification_result.num_events,
                    'input_length': len(text),
                },
            )

            # Check if any events were found
            if not identification_result.has_events:
                logger.warning(f"No events found in session {session_id}")
                capture_pipeline_trace(
                    session_id, input_type, is_guest, 'no_events',
                    duration_ms=(_time.time() - pipeline_start) * 1000,
                )
                flush_posthog()
                DBSession.mark_error(session_id, "No events found in the provided input")
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

            # Update context with event count for downstream Agent 2/3 calls
            set_tracking_context(num_events=identification_result.num_events)

            # Phase 2: Process events (extraction → optional personalization → DB)
            session = DBSession.get_by_id(session_id)
            user_id = session['user_id']
            is_guest = session.get('guest_mode', False)
            timezone = self._get_user_timezone(user_id)

            phase2_start = _time.time()
            self._process_events_for_session(
                session_id=session_id,
                user_id=user_id,
                events=identification_result.events,
                timezone=timezone,
                is_guest=is_guest,
                agent_2=agent_2,
                agent_3=agent_3,
            )
            phase2_ms = (_time.time() - phase2_start) * 1000

            capture_phase_span(
                'processing', session_id, phase2_ms,
                properties={
                    'num_events': identification_result.num_events,
                    'has_personalization': get_tracking_property('has_personalization', False),
                },
            )

            # Mark session as complete
            DBSession.update_status(session_id, 'processed')

            capture_pipeline_trace(
                session_id, input_type, is_guest, 'success',
                num_events=identification_result.num_events,
                has_personalization=get_tracking_property('has_personalization', False),
                duration_ms=(_time.time() - pipeline_start) * 1000,
            )
            flush_posthog()

        except Exception as e:
            error_message = str(e)
            logger.error(f"Error processing session {session_id}: {error_message}\n{traceback.format_exc()}")
            capture_pipeline_trace(
                session_id, input_type, is_guest, 'error',
                duration_ms=(_time.time() - pipeline_start) * 1000,
                error_message=error_message,
            )
            capture_agent_error("pipeline", e, {'session_id': session_id, 'session_type': 'text'})
            flush_posthog()
            try:
                DBSession.mark_error(session_id, error_message)
            except Exception as db_err:
                logger.critical(
                    f"Failed to mark session {session_id} as error "
                    f"(original: {error_message}): {db_err}"
                )

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
            file_type: Type of file ('image', 'audio', 'pdf', 'document')
        """
        input_type = file_type
        is_guest = False
        pipeline_start = _time.time()

        try:
            # Update status to processing
            DBSession.update_status(session_id, 'processing')

            # Set PostHog tracking for this background thread
            session_data = DBSession.get_by_id(session_id)
            is_guest = session_data.get('guest_mode', False) if session_data else False
            user_id = session_data.get('user_id', 'anonymous') if session_data else 'anonymous'
            pipeline_label = f"Session: {file_type}{' (guest)' if is_guest else ''}"

            set_tracking_context(
                distinct_id=user_id,
                trace_id=session_id,
                pipeline=pipeline_label,
                input_type=input_type,
                is_guest=is_guest,
            )

            # Determine if vision is needed (only images; PDFs use text extraction)
            requires_vision = file_type == 'image'

            if file_type == 'audio':
                text = f"[Audio file content from {file_path}]"
                metadata = {'source': 'audio', 'file_path': file_path}
            elif file_type == 'image':
                text = f"[Image file at {file_path}]"
                metadata = {'source': 'image', 'file_path': file_path, 'requires_vision': True}
            elif file_type == 'pdf':
                text = self._convert_document(file_path)
                metadata = {'source': 'pdf', 'file_path': file_path}
            elif file_type == 'document':
                text = self._convert_document(file_path)
                metadata = {'source': 'document', 'file_path': file_path}
            elif file_type in ('text', 'email'):
                from storage.file_handler import FileStorage
                file_bytes = FileStorage.download_file(file_path)
                text = file_bytes.decode('utf-8', errors='replace')
                if not text.strip():
                    raise ValueError("File is empty or contains no readable text")
                metadata = {'source': file_type, 'file_path': file_path}
            else:
                raise ValueError(f"Unsupported file type: {file_type}")

            # Select agents based on input complexity
            agent_1, agent_2, agent_3, complexity = self._select_agents(text, input_type=file_type, metadata=metadata)

            # Launch title generation in background (runs in parallel with pipeline)
            title_thread = threading.Thread(
                target=self._generate_and_update_title,
                args=(session_id, text, metadata),
                daemon=True
            )
            title_thread.start()

            # Phase 1: Event Identification (with chunking for large text inputs)
            phase1_start = _time.time()
            identification_result = identify_events_chunked(
                agent=agent_1,
                raw_input=text,
                metadata=metadata,
                requires_vision=requires_vision,
                tracking_context={
                    'distinct_id': user_id,
                    'trace_id': session_id,
                    'pipeline': pipeline_label,
                    'input_type': input_type,
                    'is_guest': is_guest,
                },
            )
            phase1_ms = (_time.time() - phase1_start) * 1000

            capture_phase_span(
                'identification', session_id, phase1_ms,
                outcome='success' if identification_result.has_events else 'no_events',
                properties={
                    'num_events_found': identification_result.num_events,
                    'input_length': len(text),
                },
            )

            # Check if any events were found
            if not identification_result.has_events:
                logger.warning(f"No events found in file session {session_id}")
                capture_pipeline_trace(
                    session_id, input_type, is_guest, 'no_events',
                    duration_ms=(_time.time() - pipeline_start) * 1000,
                )
                flush_posthog()
                DBSession.mark_error(session_id, "No events found in the provided input")
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

            # Update context with event count for downstream Agent 2/3 calls
            set_tracking_context(num_events=identification_result.num_events)

            # Phase 2: Process events (extraction → optional personalization → DB)
            session = DBSession.get_by_id(session_id)
            user_id = session['user_id']
            is_guest = session.get('guest_mode', False)
            timezone = self._get_user_timezone(user_id)

            phase2_start = _time.time()
            self._process_events_for_session(
                session_id=session_id,
                user_id=user_id,
                events=identification_result.events,
                timezone=timezone,
                is_guest=is_guest,
                agent_2=agent_2,
                agent_3=agent_3,
            )
            phase2_ms = (_time.time() - phase2_start) * 1000

            capture_phase_span(
                'processing', session_id, phase2_ms,
                properties={
                    'num_events': identification_result.num_events,
                    'has_personalization': get_tracking_property('has_personalization', False),
                },
            )

            # Mark session as complete
            DBSession.update_status(session_id, 'processed')

            capture_pipeline_trace(
                session_id, input_type, is_guest, 'success',
                num_events=identification_result.num_events,
                has_personalization=get_tracking_property('has_personalization', False),
                duration_ms=(_time.time() - pipeline_start) * 1000,
            )
            flush_posthog()

        except Exception as e:
            error_message = str(e)
            logger.error(f"Error processing file session {session_id}: {error_message}\n{traceback.format_exc()}")
            capture_pipeline_trace(
                session_id, input_type, is_guest, 'error',
                duration_ms=(_time.time() - pipeline_start) * 1000,
                error_message=error_message,
            )
            capture_agent_error("pipeline", e, {'session_id': session_id, 'session_type': 'file'})
            flush_posthog()
            try:
                DBSession.mark_error(session_id, error_message)
            except Exception as db_err:
                logger.critical(
                    f"Failed to mark session {session_id} as error "
                    f"(original: {error_message}): {db_err}"
                )
