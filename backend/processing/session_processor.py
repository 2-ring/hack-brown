"""
Session processor for running AI pipeline on sessions.
Connects the existing LangChain pipeline stages to the session workflow.
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
from extraction.temporal_resolver import resolve_temporal
from preferences.agent import PersonalizationAgent
from extraction.title_generator import get_title_generator
from events.service import EventService
from preferences.service import PersonalizationService
from processing.parallel import process_events_parallel, EventProcessingResult
from processing.chunked_identification import identify_events_chunked
from extraction.langextract_identifier import identify_events_langextract
from config.langextract import PASSES_SIMPLE, PASSES_COMPLEX
from config.posthog import (
    set_tracking_context, flush_posthog, capture_agent_error,
    capture_pipeline_trace,
    get_tracking_property, CLEAR,
)
import time as _time

logger = logging.getLogger(__name__)


class SessionProcessor:
    """Processes sessions through the full AI pipeline."""

    def __init__(self, llm, input_processor_factory: InputProcessorFactory, llm_personalization=None, pattern_refresh_service=None, llm_light=None, llm_personalization_light=None, llm_vision=None):
        """
        Initialize the session processor with pipeline stages.

        Args:
            llm: LangChain LLM instance for pipeline stages
            input_processor_factory: Factory for processing files
            llm_personalization: Optional separate LLM for PERSONALIZE stage
            pattern_refresh_service: Optional PatternRefreshService for incremental refresh
            llm_light: Optional lightweight LLM for simple inputs
            llm_personalization_light: Optional lightweight LLM for PERSONALIZE stage on simple inputs
            llm_vision: Optional separate LLM for vision/image identification
        """
        self.llm = llm
        self.input_processor_factory = input_processor_factory

        # STRUCTURE stage uses Instructor for self-correcting structured output
        from config.text import create_instructor_client
        client, model, provider = create_instructor_client('structure')

        # CONSOLIDATE stage uses a lightweight Instructor client
        cons_client, cons_model, cons_provider = create_instructor_client('default', light=True)
        self._consolidation_client = cons_client
        self._consolidation_model = cons_model
        self._consolidation_provider = cons_provider

        # Standard pipeline stages
        self.identify_agent = EventIdentificationAgent(llm)
        self.identify_agent_vision = EventIdentificationAgent(llm_vision or llm)
        self.structure_agent = EventExtractionAgent(client, model, provider)
        self.personalize_agent = PersonalizationAgent(llm_personalization or llm)

        # Light pipeline stages (for simple inputs)
        if llm_light:
            client_l, model_l, provider_l = create_instructor_client('structure', light=True)
            self.identify_agent_light = EventIdentificationAgent(llm_light)
            self.structure_agent_light = EventExtractionAgent(client_l, model_l, provider_l)
            self.personalize_agent_light = PersonalizationAgent(llm_personalization_light or llm_light)
            self.has_light_stages = True
        else:
            self.has_light_stages = False

        # Services
        self.personalization_service = PersonalizationService()
        self.pattern_refresh_service = pattern_refresh_service

        # Initialize title generator
        self.title_generator = get_title_generator()

    def _transcribe_audio(self, file_path: str) -> str:
        """
        Download an audio file from Supabase storage and transcribe using
        the configured audio processor (Deepgram/OpenAI/Grok).
        Returns the transcribed text.
        """
        import tempfile
        from storage.file_handler import FileStorage

        # Download file bytes from Supabase
        file_bytes = FileStorage.download_file(file_path)

        # Write to temp file (audio processor needs a local file path)
        ext = os.path.splitext(file_path)[1] or '.webm'
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            result = self.input_processor_factory.process_file(tmp_path, InputType.AUDIO)

            if not result.success:
                raise ValueError(f"Audio transcription failed: {result.error}")

            if not result.text or not result.text.strip():
                raise ValueError("Audio transcription returned empty text")

            logger.info(f"Audio transcribed: {file_path} → {len(result.text)} chars")
            return result.text
        finally:
            os.unlink(tmp_path)

    def _prepare_image(self, file_path: str) -> tuple:
        """
        Download an image from Supabase storage, base64-encode it, and
        return (placeholder_text, metadata) ready for the vision pipeline.
        """
        import base64
        from pathlib import Path
        from storage.file_handler import FileStorage

        file_bytes = FileStorage.download_file(file_path)

        image_data = base64.b64encode(file_bytes).decode('utf-8')

        # Determine media type from file extension
        ext = Path(file_path).suffix.lower()
        media_types = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.png': 'image/png', '.gif': 'image/gif',
            '.webp': 'image/webp', '.bmp': 'image/bmp',
        }
        media_type = media_types.get(ext, 'image/jpeg')

        text = f"[Image: {Path(file_path).name}]"
        metadata = {
            'source': 'image',
            'file_path': file_path,
            'requires_vision': True,
            'image_data': image_data,
            'media_type': media_type,
            'file_name': Path(file_path).name,
        }

        logger.info(f"Image prepared: {file_path} → {len(image_data)} base64 chars")
        return text, metadata

    def _convert_document(self, file_path: str) -> str:
        """
        Download a document from Supabase storage and convert to structured
        Markdown using Docling. Returns the extracted text.
        """
        import tempfile
        from storage.file_handler import FileStorage
        from docling.document_converter import DocumentConverter

        # Download file bytes from Supabase
        file_bytes = FileStorage.download_file(file_path)

        # Write to temp file
        ext = os.path.splitext(file_path)[1] or '.docx'
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            converter = DocumentConverter()
            result = converter.convert(tmp_path)
            text = result.document.export_to_markdown()

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
            return None, None

    def _select_pipeline_stages(self, text: str, input_type: str = 'text', metadata: dict = None):
        """
        Select pipeline stage tier (light vs standard) based on input complexity.

        Returns:
            tuple: (identifier, structurer, personalizer, complexity_result)
        """
        from config.complexity import InputComplexityAnalyzer, ComplexityLevel

        if not self.has_light_stages:
            return (self.identify_agent, self.structure_agent, self.personalize_agent, None)

        result = InputComplexityAnalyzer.analyze(text, input_type, metadata)

        if result.level == ComplexityLevel.SIMPLE:
            logger.info(f"Complexity: SIMPLE ({result.reason}) -> using light models")
            return (self.identify_agent_light, self.structure_agent_light, self.personalize_agent_light, result)
        else:
            logger.info(f"Complexity: COMPLEX ({result.reason}) -> using standard models")
            return (self.identify_agent, self.structure_agent, self.personalize_agent, result)

    def _process_events_for_session(
        self,
        session_id: str,
        user_id: str,
        events: list,
        timezone: str,
        is_guest: bool = False,
        structurer: EventExtractionAgent = None,
        personalizer: PersonalizationAgent = None,
    ) -> None:
        """
        Process identified events through CONSOLIDATE → STRUCTURE → RESOLVE → PERSONALIZE.

        For <=3 events: uses legacy per-event flow (no consolidation needed).
        For >3 events: consolidates into groups, then processes per-group in parallel.

        Shared by process_text_session and process_file_session.
        """
        # Fall back to standard pipeline stages if not specified
        structurer = structurer or self.structure_agent
        personalizer = personalizer or self.personalize_agent

        # Load personalization context once for the session
        patterns, historical_events = self._load_personalization_context(user_id, is_guest)
        use_personalization = patterns is not None

        # Update thread-local so pipeline trace and downstream stages know
        set_tracking_context(has_personalization=use_personalization)

        if use_personalization:
            logger.info(f"Session {session_id}: Using personalization (PERSONALIZE stage)")
        else:
            logger.info(f"Session {session_id}: Skipping personalization")

        # Lock for thread-safe DB writes (Session.add_event does read-modify-write)
        db_lock = threading.Lock()

        # Capture parent thread context to propagate to worker threads
        _parent_input_type = get_tracking_property('input_type')
        _parent_pipeline = get_tracking_property('pipeline')

        total_events = len(events)

        # ── Small batches: skip consolidation, use per-event flow ──────────
        if total_events <= 3:
            logger.info(f"Session {session_id}: {total_events} events — skipping CONSOLIDATE")
            self._process_events_per_event(
                session_id=session_id, user_id=user_id, events=events,
                timezone=timezone, is_guest=is_guest, structurer=structurer,
                personalizer=personalizer, patterns=patterns,
                historical_events=historical_events,
                use_personalization=use_personalization,
                db_lock=db_lock, _parent_input_type=_parent_input_type,
                _parent_pipeline=_parent_pipeline,
            )
            return

        # ── CONSOLIDATE: group + dedup + cross-event context ───────────────
        from extraction.consolidation import consolidate_events, build_groups

        try:
            consolidation_result = consolidate_events(
                events=events,
                instructor_client=self._consolidation_client,
                model_name=self._consolidation_model,
                provider=self._consolidation_provider,
            )
            groups = build_groups(events, consolidation_result)
            cross_event_context = consolidation_result.cross_event_context
            logger.info(
                f"Session {session_id}: CONSOLIDATE complete — "
                f"{len(groups)} groups, cross_event_context: {cross_event_context[:100]}..."
            )
        except Exception as e:
            logger.warning(
                f"Session {session_id}: CONSOLIDATE failed ({e}), "
                f"falling back to per-event flow"
            )
            capture_agent_error("consolidation", e, {'session_id': session_id})
            self._process_events_per_event(
                session_id=session_id, user_id=user_id, events=events,
                timezone=timezone, is_guest=is_guest, structurer=structurer,
                personalizer=personalizer, patterns=patterns,
                historical_events=historical_events,
                use_personalization=use_personalization,
                db_lock=db_lock, _parent_input_type=_parent_input_type,
                _parent_pipeline=_parent_pipeline,
            )
            return

        # ── STRUCTURE + RESOLVE + PERSONALIZE: per-group in parallel ───────
        def process_single_group(group_idx, group_data):
            """Process one group: batch STRUCTURE → per-event RESOLVE + PERSONALIZE + DB."""
            category, indexed_events = group_data
            group_events = [ie for _, ie in indexed_events]
            original_indices = [idx for idx, _ in indexed_events]

            num_groups = len(groups)

            # Propagate tracking context with group info.
            set_tracking_context(
                distinct_id=user_id,
                trace_id=session_id,
                pipeline=_parent_pipeline,
                input_type=_parent_input_type,
                is_guest=is_guest,
                num_events=total_events,
                has_personalization=use_personalization,
                parent_id=CLEAR,
                group_index=group_idx,
                num_groups=num_groups,
                group_category=category,
                event_index=CLEAR,
                event_description=CLEAR,
            )

            try:
                # STRUCTURE: batch extraction for the group
                extracted_events = structurer.execute_batch(
                    events=group_events,
                    cross_event_context=cross_event_context,
                    document_context=group_events[0].document_context,
                    input_type=group_events[0].input_type,
                )

                # Validate count matches
                if len(extracted_events) != len(group_events):
                    logger.warning(
                        f"Session {session_id}: Group '{category}' returned "
                        f"{len(extracted_events)} events, expected {len(group_events)}. "
                        f"Processing what we got."
                    )

                # Per-event: RESOLVE → PERSONALIZE → DB write
                results = []
                for i, (orig_idx, identified_event) in enumerate(indexed_events):
                    if i >= len(extracted_events):
                        break
                    extracted_event = extracted_events[i]

                    # Switch to event context for Personalize
                    set_tracking_context(
                        event_index=orig_idx,
                        event_description=identified_event.description,
                        group_index=CLEAR,
                        num_groups=CLEAR,
                        group_category=CLEAR,
                    )

                    try:
                        # RESOLVE: NL temporal → ISO 8601
                        calendar_event = resolve_temporal(
                            extracted_event, user_timezone=timezone
                        )

                        # PERSONALIZE
                        if use_personalization:
                            calendar_event = personalizer.execute(
                                event=calendar_event,
                                discovered_patterns=patterns,
                                historical_events=historical_events,
                                user_id=user_id
                            )

                        # DB write
                        with db_lock:
                            EventService.create_dropcal_event(
                                user_id=user_id,
                                session_id=session_id,
                                summary=calendar_event.summary,
                                start_time=calendar_event.start.dateTime,
                                end_time=calendar_event.end.dateTime if calendar_event.end else None,
                                start_date=calendar_event.start.date,
                                end_date=calendar_event.end.date if calendar_event.end else None,
                                is_all_day=calendar_event.start.date is not None,
                                description=calendar_event.description,
                                location=calendar_event.location,
                                calendar_name=calendar_event.calendar,
                                color_id=calendar_event.colorId,
                                original_input=identified_event.raw_text,
                                extracted_facts=calendar_event.model_dump(),
                                system_suggestion=calendar_event.model_dump(),
                                recurrence=calendar_event.recurrence,
                                attendees=calendar_event.attendees
                            )

                        results.append(EventProcessingResult(
                            index=orig_idx, success=True, calendar_event=calendar_event
                        ))

                    except Exception as e:
                        logger.error(
                            f"Error on event {orig_idx+1} (group '{category}') "
                            f"in session {session_id}: {e}\n{traceback.format_exc()}"
                        )
                        capture_agent_error("personalization", e, {
                            'session_id': session_id, 'event_index': orig_idx,
                        })
                        results.append(EventProcessingResult(
                            index=orig_idx, success=False,
                            warning=f"Event {orig_idx+1}: {str(e)}", error=e,
                        ))

                return EventProcessingResult(
                    index=group_idx, success=True,
                )

            except Exception as e:
                # Batch extraction failed for the whole group — fall back to per-event
                logger.warning(
                    f"Session {session_id}: Group '{category}' batch extraction "
                    f"failed ({e}), falling back to per-event"
                )
                capture_agent_error("extraction_batch", e, {
                    'session_id': session_id, 'group': category,
                })
                for orig_idx, identified_event in indexed_events:
                    set_tracking_context(
                        event_index=orig_idx,
                        event_description=identified_event.description,
                        group_index=CLEAR,
                        num_groups=CLEAR,
                        group_category=CLEAR,
                    )
                    try:
                        extracted_event = structurer.execute(
                            identified_event.raw_text,
                            identified_event.description,
                            document_context=identified_event.document_context,
                            surrounding_context=identified_event.surrounding_context,
                            input_type=identified_event.input_type,
                        )
                        calendar_event = resolve_temporal(
                            extracted_event, user_timezone=timezone
                        )
                        if use_personalization:
                            calendar_event = personalizer.execute(
                                event=calendar_event,
                                discovered_patterns=patterns,
                                historical_events=historical_events,
                                user_id=user_id
                            )
                        with db_lock:
                            EventService.create_dropcal_event(
                                user_id=user_id, session_id=session_id,
                                summary=calendar_event.summary,
                                start_time=calendar_event.start.dateTime,
                                end_time=calendar_event.end.dateTime if calendar_event.end else None,
                                start_date=calendar_event.start.date,
                                end_date=calendar_event.end.date if calendar_event.end else None,
                                is_all_day=calendar_event.start.date is not None,
                                description=calendar_event.description,
                                location=calendar_event.location,
                                calendar_name=calendar_event.calendar,
                                color_id=calendar_event.colorId,
                                original_input=identified_event.raw_text,
                                extracted_facts=calendar_event.model_dump(),
                                system_suggestion=calendar_event.model_dump(),
                                recurrence=calendar_event.recurrence,
                                attendees=calendar_event.attendees
                            )
                    except Exception as inner_e:
                        logger.error(
                            f"Fallback error on event {orig_idx+1} in session "
                            f"{session_id}: {inner_e}\n{traceback.format_exc()}"
                        )
                        capture_agent_error("extraction", inner_e, {
                            'session_id': session_id, 'event_index': orig_idx,
                        })

                return EventProcessingResult(
                    index=group_idx, success=False,
                    warning=f"Group '{category}' fell back to per-event",
                )

        # Dispatch groups in parallel
        group_list = list(groups.items())
        batch_result = process_events_parallel(
            events=group_list,
            process_single_event=lambda idx, item: process_single_group(idx, item),
        )

        if batch_result.warnings:
            logger.warning(
                f"Session {session_id}: {len(batch_result.warnings)} group(s) "
                f"had issues: {batch_result.warnings}"
            )

    def _process_events_per_event(
        self,
        session_id: str,
        user_id: str,
        events: list,
        timezone: str,
        is_guest: bool,
        structurer,
        personalizer,
        patterns,
        historical_events,
        use_personalization: bool,
        db_lock,
        _parent_input_type,
        _parent_pipeline,
    ) -> None:
        """Per-event processing (used for small batches and fallback)."""

        def process_single_event(idx, event):
            set_tracking_context(
                distinct_id=user_id,
                trace_id=session_id,
                pipeline=_parent_pipeline,
                input_type=_parent_input_type,
                is_guest=is_guest,
                num_events=len(events),
                has_personalization=use_personalization,
                event_index=idx,
                event_description=event.description,
                parent_id=CLEAR,
            )
            try:
                extracted_event = structurer.execute(
                    event.raw_text,
                    event.description,
                    document_context=event.document_context,
                    surrounding_context=event.surrounding_context,
                    input_type=event.input_type,
                )

                calendar_event = resolve_temporal(
                    extracted_event, user_timezone=timezone
                )

                if use_personalization:
                    calendar_event = personalizer.execute(
                        event=calendar_event,
                        discovered_patterns=patterns,
                        historical_events=historical_events,
                        user_id=user_id
                    )

                with db_lock:
                    EventService.create_dropcal_event(
                        user_id=user_id,
                        session_id=session_id,
                        summary=calendar_event.summary,
                        start_time=calendar_event.start.dateTime,
                        end_time=calendar_event.end.dateTime if calendar_event.end else None,
                        start_date=calendar_event.start.date,
                        end_date=calendar_event.end.date if calendar_event.end else None,
                        is_all_day=calendar_event.start.date is not None,
                        description=calendar_event.description,
                        location=calendar_event.location,
                        calendar_name=calendar_event.calendar,
                        color_id=calendar_event.colorId,
                        original_input=event.raw_text,
                        extracted_facts=calendar_event.model_dump(),
                        system_suggestion=calendar_event.model_dump(),
                        recurrence=calendar_event.recurrence,
                        attendees=calendar_event.attendees
                    )

                return EventProcessingResult(
                    index=idx, success=True, calendar_event=calendar_event
                )

            except Exception as e:
                logger.error(
                    f"Error processing event {idx+1} in session {session_id}: "
                    f"{e}\n{traceback.format_exc()}"
                )
                capture_agent_error("extraction", e, {
                    'session_id': session_id, 'event_index': idx,
                })
                return EventProcessingResult(
                    index=idx, success=False,
                    warning=f"Event {idx+1}: {str(e)}", error=e,
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
                # Clear per-session fields to prevent leakage from reused threads
                parent_id=CLEAR,
                num_events=CLEAR,
                has_personalization=CLEAR,
                event_index=CLEAR,
                event_description=CLEAR,
                group_index=CLEAR,
                num_groups=CLEAR,
                group_category=CLEAR,
                chunk_index=CLEAR,
                calendar_name=CLEAR,
            )

            # Select pipeline stages based on input complexity
            identifier, structurer, personalizer, complexity = self._select_pipeline_stages(text, input_type='text')

            # Launch title generation in background (runs in parallel with pipeline)
            title_thread = threading.Thread(
                target=self._generate_and_update_title,
                args=(session_id, text, {}),
                daemon=True
            )
            title_thread.start()

            # Phase 1: Event Identification (LangExtract)
            from config.complexity import InputComplexityAnalyzer, ComplexityLevel
            complexity_for_passes = InputComplexityAnalyzer.analyze(text, input_type='text')
            passes = PASSES_COMPLEX if complexity_for_passes.level == ComplexityLevel.COMPLEX else PASSES_SIMPLE

            identification_result = identify_events_langextract(
                text=text,
                extraction_passes=passes,
                tracking_context={
                    'distinct_id': user_id,
                    'trace_id': session_id,
                    'pipeline': pipeline_label,
                    'input_type': input_type,
                    'is_guest': is_guest,
                },
                input_type=input_type,
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

            # Update context with event count for downstream pipeline stages
            set_tracking_context(num_events=identification_result.num_events)

            # Phase 2: Process events (STRUCTURE → optional PERSONALIZE → DB)
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
                structurer=structurer,
                personalizer=personalizer,
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
                # Clear per-session fields to prevent leakage from reused threads
                parent_id=CLEAR,
                num_events=CLEAR,
                has_personalization=CLEAR,
                event_index=CLEAR,
                event_description=CLEAR,
                group_index=CLEAR,
                num_groups=CLEAR,
                group_category=CLEAR,
                chunk_index=CLEAR,
                calendar_name=CLEAR,
            )

            # Determine if vision is needed (only images; PDFs use text extraction)
            requires_vision = file_type == 'image'

            if file_type == 'audio':
                text = self._transcribe_audio(file_path)
                metadata = {'source': 'audio', 'file_path': file_path}
            elif file_type == 'image':
                text, metadata = self._prepare_image(file_path)
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

            # Select pipeline stages based on input complexity
            identifier, structurer, personalizer, complexity = self._select_pipeline_stages(text, input_type=file_type, metadata=metadata)

            # Launch title generation in background (runs in parallel with pipeline)
            title_thread = threading.Thread(
                target=self._generate_and_update_title,
                args=(session_id, text, metadata),
                daemon=True
            )
            title_thread.start()

            # Phase 1: Event Identification
            if requires_vision:
                # Image inputs: use vision-specific identifier (grok-3 lacks image support)
                identification_result = identify_events_chunked(
                    agent=self.identify_agent_vision,
                    raw_input=text,
                    metadata=metadata,
                    requires_vision=True,
                    tracking_context={
                        'distinct_id': user_id,
                        'trace_id': session_id,
                        'pipeline': pipeline_label,
                        'input_type': input_type,
                        'is_guest': is_guest,
                    },
                )
            else:
                # Text-based inputs (PDFs, audio transcripts, emails, documents)
                from config.complexity import InputComplexityAnalyzer, ComplexityLevel
                complexity_for_passes = InputComplexityAnalyzer.analyze(text, input_type=file_type)
                passes = PASSES_COMPLEX if complexity_for_passes.level == ComplexityLevel.COMPLEX else PASSES_SIMPLE

                identification_result = identify_events_langextract(
                    text=text,
                    extraction_passes=passes,
                    tracking_context={
                        'distinct_id': user_id,
                        'trace_id': session_id,
                        'pipeline': pipeline_label,
                        'input_type': input_type,
                        'is_guest': is_guest,
                    },
                    input_type=input_type,
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

            # Update context with event count for downstream pipeline stages
            set_tracking_context(num_events=identification_result.num_events)

            # Phase 2: Process events (STRUCTURE → optional PERSONALIZE → DB)
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
                structurer=structurer,
                personalizer=personalizer,
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
