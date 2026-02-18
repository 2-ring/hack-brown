"""
Session processor — runs the AI pipeline on sessions.

Pipeline: EXTRACT (1 LLM call) → RESOLVE (0 LLM, Duckling) → PERSONALIZE (0-1 LLM)
"""

from typing import Optional
import os
import logging
import threading
import traceback
from database.models import Session as DBSession, Event
from processors.factory import InputProcessorFactory, InputType
from extraction.extract import UnifiedExtractor
from extraction.temporal_resolver import resolve_temporal
from preferences.agent import PersonalizationAgent
from extraction.title_generator import get_title_generator
from events.service import EventService
from preferences.service import PersonalizationService
from config.posthog import (
    set_tracking_context, flush_posthog, capture_agent_error,
    capture_pipeline_trace, stage_span,
    get_tracking_property, CLEAR,
)
import time as _time

logger = logging.getLogger(__name__)


class SessionProcessor:
    """Processes sessions through the EXTRACT → RESOLVE → PERSONALIZE pipeline."""

    def __init__(self, llm, input_processor_factory: InputProcessorFactory,
                 llm_personalization=None, pattern_refresh_service=None,
                 llm_vision=None):
        self.input_processor_factory = input_processor_factory

        # Pipeline stages
        self.extractor = UnifiedExtractor(llm, llm_vision=llm_vision)
        self.personalize_agent = PersonalizationAgent(llm_personalization or llm)

        # Services
        self.personalization_service = PersonalizationService()
        self.pattern_refresh_service = pattern_refresh_service
        self.title_generator = get_title_generator()

    # =========================================================================
    # Input preprocessing (unchanged)
    # =========================================================================

    def _transcribe_audio(self, file_path: str) -> str:
        """Download and transcribe an audio file from Supabase storage."""
        import tempfile
        from storage.file_handler import FileStorage

        file_bytes = FileStorage.download_file(file_path)

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
        """Download an image from Supabase, return (placeholder_text, metadata)."""
        import base64
        from pathlib import Path
        from storage.file_handler import FileStorage

        file_bytes = FileStorage.download_file(file_path)
        image_data = base64.b64encode(file_bytes).decode('utf-8')

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
        """Download a document from Supabase and convert to Markdown."""
        import tempfile
        from storage.file_handler import FileStorage
        from docling.document_converter import DocumentConverter

        file_bytes = FileStorage.download_file(file_path)

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
        """Get user's timezone from profile, default to America/New_York."""
        try:
            from database.models import User
            user = User.get_by_id(user_id)
            if user and user.get('timezone'):
                return user['timezone']
        except Exception as e:
            logger.warning(f"Could not fetch user timezone: {e}")
        return 'America/New_York'

    def _generate_and_update_title(self, session_id: str, text: str, metadata: dict = None) -> None:
        """Generate title asynchronously (runs in background thread)."""
        try:
            from config.limits import TextLimits
            title = self.title_generator.generate(
                text, max_words=TextLimits.SESSION_TITLE_MAX_WORDS,
                vision_metadata=metadata
            )
            DBSession.update_title(session_id, title)
            logger.info(f"Title generated for session {session_id}: '{title}'")
        except Exception as e:
            logger.warning(f"Error generating title for session {session_id}: {e}")

    def _load_personalization_context(self, user_id: str, is_guest: bool):
        """Load personalization context (once per session)."""
        if is_guest:
            return None, None

        try:
            patterns = self.personalization_service.load_patterns(user_id)
            if not patterns:
                return None, None

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

    # =========================================================================
    # Core pipeline
    # =========================================================================

    def _run_pipeline(
        self,
        session_id: str,
        text: str,
        input_type: str,
        metadata: Optional[dict] = None,
    ) -> None:
        """
        Run the full EXTRACT → RESOLVE → PERSONALIZE pipeline.

        Shared by process_text_session and process_file_session.
        """
        session = DBSession.get_by_id(session_id)
        is_guest = session.get('guest_mode', False) if session else False
        user_id = session.get('user_id', 'anonymous') if session else 'anonymous'
        pipeline_label = f"Session: {input_type}{' (guest)' if is_guest else ''}"
        pipeline_start = _time.time()

        try:
            DBSession.update_status(session_id, 'processing')

            set_tracking_context(
                distinct_id=user_id,
                trace_id=session_id,
                session_id=session_id,
                pipeline=pipeline_label,
                input_type=input_type,
                is_guest=is_guest,
                parent_id=CLEAR, num_events=CLEAR,
                has_personalization=CLEAR, event_index=CLEAR,
                event_description=CLEAR, group_index=CLEAR,
                num_groups=CLEAR, group_category=CLEAR,
                chunk_index=CLEAR, calendar_name=CLEAR,
            )

            # Title generation in background
            title_thread = threading.Thread(
                target=self._generate_and_update_title,
                args=(session_id, text, metadata or {}),
                daemon=True
            )
            title_thread.start()

            # ── EXTRACT: single LLM call ────────────────────────────────
            with stage_span("extraction"):
                extracted_events = self.extractor.execute(
                    text, input_type=input_type, metadata=metadata
                )

            if not extracted_events:
                logger.warning(f"No events found in session {session_id}")
                capture_pipeline_trace(
                    session_id, input_type, is_guest, 'no_events',
                    duration_ms=(_time.time() - pipeline_start) * 1000,
                )
                flush_posthog()
                DBSession.mark_error(session_id, "No events found in the provided input")
                return

            # Save extracted event summaries
            DBSession.update_extracted_events(session_id, [
                {'raw_text': [], 'description': e.summary}
                for e in extracted_events
            ])
            set_tracking_context(num_events=len(extracted_events))

            # ── RESOLVE: per-event, deterministic (Duckling) ────────────
            timezone = self._get_user_timezone(user_id)
            calendar_events = []
            for extracted in extracted_events:
                try:
                    calendar_event = resolve_temporal(
                        extracted, user_timezone=timezone
                    )
                    calendar_events.append(calendar_event)
                except Exception as e:
                    logger.warning(
                        f"Temporal resolution failed for '{extracted.summary}': {e}"
                    )

            if not calendar_events:
                DBSession.mark_error(session_id, "No events could be resolved")
                capture_pipeline_trace(
                    session_id, input_type, is_guest, 'error',
                    duration_ms=(_time.time() - pipeline_start) * 1000,
                    error_message="All temporal resolutions failed",
                )
                flush_posthog()
                return

            # ── PERSONALIZE: single batched call (or skip) ──────────────
            patterns, historical_events = self._load_personalization_context(
                user_id, is_guest
            )
            use_personalization = patterns is not None
            set_tracking_context(has_personalization=use_personalization)

            if use_personalization:
                logger.info(f"Session {session_id}: Personalizing {len(calendar_events)} events")
                for i, cal_event in enumerate(calendar_events):
                    try:
                        set_tracking_context(
                            event_index=i,
                            event_description=cal_event.summary,
                        )
                        with stage_span("personalization"):
                            calendar_events[i] = self.personalize_agent.execute(
                                event=cal_event,
                                discovered_patterns=patterns,
                                historical_events=historical_events,
                                user_id=user_id,
                            )
                    except Exception as e:
                        logger.warning(
                            f"Personalization failed for '{cal_event.summary}': {e}"
                        )
                        capture_agent_error("personalization", e, {
                            'session_id': session_id, 'event_index': i,
                        })

            # ── SAVE: write all events to DB ────────────────────────────
            for calendar_event in calendar_events:
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
                    original_input='',
                    extracted_facts=calendar_event.model_dump(),
                    system_suggestion=calendar_event.model_dump(),
                    recurrence=calendar_event.recurrence,
                    attendees=calendar_event.attendees,
                )

            DBSession.update_status(session_id, 'processed')

            capture_pipeline_trace(
                session_id, input_type, is_guest, 'success',
                num_events=len(calendar_events),
                has_personalization=use_personalization,
                duration_ms=(_time.time() - pipeline_start) * 1000,
            )
            flush_posthog()

        except Exception as e:
            error_message = str(e)
            logger.error(
                f"Error processing session {session_id}: {error_message}\n"
                f"{traceback.format_exc()}"
            )
            capture_pipeline_trace(
                session_id, input_type, is_guest, 'error',
                duration_ms=(_time.time() - pipeline_start) * 1000,
                error_message=error_message,
            )
            capture_agent_error("pipeline", e, {
                'session_id': session_id, 'session_type': input_type
            })
            flush_posthog()
            try:
                DBSession.mark_error(session_id, error_message)
            except Exception as db_err:
                logger.critical(
                    f"Failed to mark session {session_id} as error "
                    f"(original: {error_message}): {db_err}"
                )

    # =========================================================================
    # Public entry points
    # =========================================================================

    def process_text_session(self, session_id: str, text: str) -> None:
        """Process a text session through the pipeline."""
        self._run_pipeline(session_id, text, input_type='text')

    def process_file_session(
        self, session_id: str, file_path: str, file_type: str
    ) -> None:
        """Process a file session through the pipeline."""
        try:
            DBSession.update_status(session_id, 'processing')

            if file_type == 'audio':
                text = self._transcribe_audio(file_path)
                metadata = {'source': 'audio', 'file_path': file_path}
            elif file_type == 'image':
                text, metadata = self._prepare_image(file_path)
            elif file_type in ('pdf', 'document'):
                text = self._convert_document(file_path)
                metadata = {'source': file_type, 'file_path': file_path}
            elif file_type in ('text', 'email'):
                from storage.file_handler import FileStorage
                file_bytes = FileStorage.download_file(file_path)
                text = file_bytes.decode('utf-8', errors='replace')
                if not text.strip():
                    raise ValueError("File is empty or contains no readable text")
                metadata = {'source': file_type, 'file_path': file_path}
            else:
                raise ValueError(f"Unsupported file type: {file_type}")

            # Reset status back to pending so _run_pipeline can set it to processing
            DBSession.update_status(session_id, 'pending')
            self._run_pipeline(session_id, text, input_type=file_type, metadata=metadata)

        except Exception as e:
            error_message = str(e)
            logger.error(f"Error preprocessing file session {session_id}: {error_message}")
            capture_agent_error("pipeline", e, {
                'session_id': session_id, 'session_type': 'file'
            })
            flush_posthog()
            try:
                DBSession.mark_error(session_id, error_message)
            except Exception as db_err:
                logger.critical(
                    f"Failed to mark session {session_id} as error: {db_err}"
                )
