"""
Session processor — runs the AI pipeline on sessions.

Pipeline: EXTRACT (1 LLM call) → RESOLVE (0 LLM, Duckling) → PERSONALIZE (0-1 LLM)
"""

from typing import Optional
from concurrent.futures import ThreadPoolExecutor
import os
import logging
import threading
import traceback
from database.models import Session as DBSession, Event
from pipeline.input.factory import InputProcessorFactory, InputType
from pipeline.extraction.extract import UnifiedExtractor
from pipeline.resolution.temporal_resolver import resolve_temporal
from pipeline.personalization.agent import PersonalizationAgent
from pipeline.extraction.icon_selector import get_icon_selector
from pipeline.events import EventService
from pipeline.personalization.service import PersonalizationService
from pipeline.stream import get_stream
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
        self.icon_selector = get_icon_selector()

    # =========================================================================
    # Input preprocessing (unchanged)
    # =========================================================================

    def _transcribe_audio(self, file_path: str) -> str:
        """Download and transcribe an audio file from Supabase storage."""
        import tempfile
        from pipeline.input.storage import FileStorage

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
        from pipeline.input.storage import FileStorage

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
        """Download a document from Supabase and convert to text.

        For PDFs: tries PyPDF2 first (<1s), falls back to Docling (~30s)
        only if PyPDF2 extracts very little text (scanned/image PDFs).
        For other documents: uses Docling directly.
        """
        import tempfile
        from pipeline.input.storage import FileStorage

        file_bytes = FileStorage.download_file(file_path)

        ext = os.path.splitext(file_path)[1] or '.docx'
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            # Fast path for PDFs: PyPDF2 text extraction
            if ext.lower() == '.pdf':
                text = self._fast_pdf_extract(tmp_path)
                if text and len(text.strip()) > 100:
                    logger.info(f"PDF extracted (fast): {file_path} → {len(text)} chars")
                    return text
                logger.info(f"Fast PDF extraction got {len(text.strip()) if text else 0} chars, falling back to Docling")

            # Slow path: Docling (layout-aware, handles scanned PDFs)
            from docling.document_converter import DocumentConverter
            converter = DocumentConverter()
            result = converter.convert(tmp_path)
            text = result.document.export_to_markdown()

            if not text or not text.strip():
                raise ValueError("No text content could be extracted from the document")

            logger.info(f"Document converted (Docling): {file_path} → {len(text)} chars")
            return text
        finally:
            os.unlink(tmp_path)

    @staticmethod
    def _fast_pdf_extract(pdf_path: str) -> str:
        """Extract text from a PDF using pdfplumber. Fast (~1-2s) and handles tables."""
        try:
            import pdfplumber
            pages = []
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    # Extract tables as markdown
                    tables = page.find_tables()
                    if tables:
                        # Get table bounding boxes to exclude from regular text
                        table_bboxes = [t.bbox for t in tables]
                        # Extract non-table text
                        filtered = page.filter(
                            lambda obj: not any(
                                obj.get('x0', 0) >= bbox[0] - 1
                                and obj.get('top', 0) >= bbox[1] - 1
                                and obj.get('x1', 0) <= bbox[2] + 1
                                and obj.get('bottom', 0) <= bbox[3] + 1
                                for bbox in table_bboxes
                            )
                        )
                        prose = (filtered.extract_text() or '').strip()
                        if prose:
                            pages.append(prose)
                        # Render each table as markdown
                        for table in tables:
                            rows = table.extract()
                            if not rows:
                                continue
                            md_lines = []
                            # Header row
                            header = [str(c or '').strip() for c in rows[0]]
                            md_lines.append('| ' + ' | '.join(header) + ' |')
                            md_lines.append('| ' + ' | '.join('---' for _ in header) + ' |')
                            # Data rows
                            for row in rows[1:]:
                                cells = [str(c or '').strip() for c in row]
                                md_lines.append('| ' + ' | '.join(cells) + ' |')
                            pages.append('\n'.join(md_lines))
                    else:
                        text = (page.extract_text() or '').strip()
                        if text:
                            pages.append(text)
            return '\n\n'.join(pages)
        except Exception as e:
            logger.debug(f"pdfplumber extraction failed: {e}")
            return ''

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

    def _select_and_update_icon(self, session_id: str, text: str) -> None:
        """Select icon asynchronously (runs in background thread)."""
        try:
            icon = self.icon_selector.select(text)
            DBSession.update_icon(session_id, icon)
            # Push to SSE stream
            stream = get_stream(session_id)
            if stream:
                stream.set_icon(icon)
            logger.info(f"Icon selected for session {session_id}: '{icon}'")
        except Exception as e:
            logger.warning(f"Error selecting icon for session {session_id}: {e}")

    @staticmethod
    def _calendar_event_to_frontend(cal_event, calendars_lookup=None, primary_calendar=None) -> dict:
        """Convert a CalendarEvent model to the dict shape the frontend expects.

        Args:
            cal_event: CalendarEvent model
            calendars_lookup: Optional dict mapping provider_cal_id → {name, color}
            primary_calendar: Optional dict {name, color} for the primary calendar
        """
        tz = 'America/New_York'
        if cal_event.start.date is not None:
            start = {'date': cal_event.start.date, 'timeZone': tz}
            end = {'date': cal_event.end.date if cal_event.end else cal_event.start.date, 'timeZone': tz}
        else:
            start = {'dateTime': cal_event.start.dateTime, 'timeZone': tz}
            end = {'dateTime': cal_event.end.dateTime if cal_event.end else None, 'timeZone': tz}

        result = {
            'summary': cal_event.summary or '',
            'start': start,
            'end': end,
        }
        if cal_event.location:
            result['location'] = cal_event.location
        if cal_event.description:
            result['description'] = cal_event.description
        if cal_event.calendar:
            result['calendar'] = cal_event.calendar
            if calendars_lookup:
                cal_info = calendars_lookup.get(cal_event.calendar)
                if cal_info:
                    result['calendarName'] = cal_info['name']
                    result['calendarColor'] = cal_info['color']
        else:
            if primary_calendar:
                result['calendarName'] = primary_calendar['name']
                result['calendarColor'] = primary_calendar['color']
        if cal_event.recurrence:
            result['recurrence'] = cal_event.recurrence
        return result

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
        preloaded_context: Optional[dict] = None,
    ) -> None:
        """
        Run the full EXTRACT → RESOLVE → PERSONALIZE pipeline.

        Shared by process_text_session and process_file_session.

        Args:
            preloaded_context: If provided, skip launching the context thread.
                Expected keys: patterns, historical_events, timezone,
                calendars_lookup, primary_calendar. Used by process_file_session
                to overlap context loading with input preprocessing.
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
                event_description=CLEAR,
                calendar_name=CLEAR,
            )

            # ── Start parallel background work ──────────────────────────
            icon_thread = threading.Thread(
                target=self._select_and_update_icon,
                args=(session_id, text),
                daemon=True
            )
            icon_thread.start()

            # Context loading: use preloaded (from file sessions) or start fresh
            context_result = {}
            tz_result = {}
            context_thread = None

            if preloaded_context is not None:
                # File sessions pre-load context in parallel with input preprocessing
                context_result = preloaded_context
                tz_result['timezone'] = preloaded_context.get('timezone', 'America/New_York')
            else:
                # Text sessions: load context in parallel with EXTRACT
                def _load_context():
                    t0 = _time.time()
                    p, h = self._load_personalization_context(user_id, is_guest)
                    context_result['patterns'] = p
                    context_result['historical_events'] = h
                    if p is not None:
                        self.personalize_agent.build_similarity_index(h)
                    logger.info(f"[timing] context_load: {_time.time() - t0:.2f}s")

                def _load_context_and_tz():
                    _load_context()
                    t0 = _time.time()
                    tz_result['timezone'] = self._get_user_timezone(user_id)
                    logger.info(f"[timing] timezone_fetch: {_time.time() - t0:.2f}s")

                    if not is_guest:
                        try:
                            from database.models import Calendar
                            cals = Calendar.get_by_user(user_id)
                            cal_lookup = {}
                            primary_cal = None
                            for cal in cals:
                                cal_id = cal.get('provider_cal_id')
                                if cal_id:
                                    info = {
                                        'name': cal.get('name', cal_id),
                                        'color': cal.get('color', '#1170C5'),
                                    }
                                    cal_lookup[cal_id] = info
                                    if cal.get('is_primary'):
                                        primary_cal = info
                            context_result['calendars_lookup'] = cal_lookup
                            context_result['primary_calendar'] = primary_cal
                        except Exception as e:
                            logger.warning(f"Could not load calendars for SSE enrichment: {e}")
                            context_result['calendars_lookup'] = {}
                            context_result['primary_calendar'] = None

                context_thread = threading.Thread(target=_load_context_and_tz, daemon=True)
                context_thread.start()

            # ── EXTRACT: single LLM call ────────────────────────────────
            t_extract = _time.time()
            extraction_result, _, _ = self.extractor.execute(
                text, input_type=input_type, metadata=metadata
            )
            extracted_events = extraction_result.events
            logger.info(f"[timing] extract: {_time.time() - t_extract:.2f}s")

            # Update session title from extraction result
            session_title = extraction_result.session_title
            DBSession.update_title(session_id, session_title)
            stream = get_stream(session_id)
            if stream:
                stream.set_title(session_title)
            logger.info(f"Title from extraction for session {session_id}: '{session_title}'")

            # Send event count to frontend as soon as extraction completes
            if extracted_events:
                stream = get_stream(session_id)
                if stream:
                    stream.set_event_count(len(extracted_events))

            if not extracted_events:
                logger.warning(f"No events found in session {session_id}")
                stream = get_stream(session_id)
                if stream:
                    stream.mark_error("No events found in the provided input")
                capture_pipeline_trace(
                    session_id, input_type, is_guest, 'no_events',
                    duration_ms=(_time.time() - pipeline_start) * 1000,
                )
                flush_posthog()
                DBSession.mark_error(session_id, "No events found in the provided input")
                return

            set_tracking_context(num_events=len(extracted_events))

            # ── RESOLVE: parallel Duckling calls ────────────────────────
            # Wait for timezone (should be ready by now, extract takes ~6s)
            if context_thread is not None:
                context_thread.join()
            timezone = tz_result.get('timezone', 'America/New_York')

            t_resolve = _time.time()
            with stage_span("resolution"):
                calendar_events = []

                def _resolve_one(extracted):
                    return resolve_temporal(extracted, user_timezone=timezone)

                with ThreadPoolExecutor(max_workers=min(len(extracted_events), 8)) as pool:
                    future_to_idx = {
                        pool.submit(_resolve_one, ext): i
                        for i, ext in enumerate(extracted_events)
                    }
                    # Collect results preserving original order
                    ordered_results = {}
                    for future in future_to_idx:
                        idx = future_to_idx[future]
                        try:
                            ordered_results[idx] = future.result()
                        except Exception as e:
                            logger.warning(
                                f"Temporal resolution failed for '{extracted_events[idx].summary}': {e}"
                            )

                    for i in sorted(ordered_results):
                        calendar_events.append(ordered_results[i])

            logger.info(f"[timing] resolve: {_time.time() - t_resolve:.2f}s")

            if not calendar_events:
                DBSession.mark_error(session_id, "No events could be resolved")
                stream = get_stream(session_id)
                if stream:
                    stream.mark_error("No events could be resolved")
                capture_pipeline_trace(
                    session_id, input_type, is_guest, 'error',
                    duration_ms=(_time.time() - pipeline_start) * 1000,
                    error_message="All temporal resolutions failed",
                )
                flush_posthog()
                return

            # ── PERSONALIZE: single batched call (or skip) ──────────────
            calendars_lookup = context_result.get('calendars_lookup', {})
            primary_calendar = context_result.get('primary_calendar')
            patterns = context_result.get('patterns')
            historical_events = context_result.get('historical_events')
            use_personalization = patterns is not None
            set_tracking_context(has_personalization=use_personalization)

            if use_personalization:
                logger.info(f"Session {session_id}: Personalizing {len(calendar_events)} events (batch)")

                t_personalize = _time.time()

                set_tracking_context(
                    event_index=CLEAR,
                    event_description=f"batch: {len(calendar_events)} events",
                )

                input_summary = getattr(extraction_result, 'input_summary', '') or ''

                calendar_events, _, _, _ = self.personalize_agent.execute_batch(
                    events=calendar_events,
                    discovered_patterns=patterns,
                    historical_events=historical_events,
                    user_id=user_id,
                    input_summary=input_summary,
                )

                logger.info(f"[timing] personalize: {_time.time() - t_personalize:.2f}s")

            # Stream events to frontend (after personalization so titles,
            # calendar assignments, and formatting are final)
            stream = get_stream(session_id)
            if stream:
                for cal_event in calendar_events:
                    stream.push_event(self._calendar_event_to_frontend(
                        cal_event, calendars_lookup, primary_calendar
                    ))

            # ── SAVE: write events to DB (batch insert) ─────────────────
            # Frontend already has events via SSE. Save to DB, signal
            # completion, then compute embeddings in background.
            t_save = _time.time()
            events_data = []
            for calendar_event in calendar_events:
                events_data.append({
                    'summary': calendar_event.summary,
                    'start_time': calendar_event.start.dateTime,
                    'end_time': calendar_event.end.dateTime if calendar_event.end else None,
                    'start_date': calendar_event.start.date,
                    'end_date': calendar_event.end.date if calendar_event.end else None,
                    'is_all_day': calendar_event.start.date is not None,
                    'description': calendar_event.description,
                    'location': calendar_event.location,
                    'calendar_name': calendar_event.calendar,
                    'original_input': '',
                    'extracted_facts': calendar_event.model_dump(),
                    'system_suggestion': calendar_event.model_dump(),
                    'recurrence': calendar_event.recurrence,
                })

            with stage_span("save"):
                created_events = EventService.create_dropcal_events_batch(
                    user_id=user_id,
                    session_id=session_id,
                    events_data=events_data,
                )

                # Deferred: save extracted event summaries alongside events
                DBSession.update_extracted_events(session_id, [
                    {'raw_text': [], 'description': e.summary}
                    for e in extracted_events
                ])

            logger.info(f"[timing] save: {_time.time() - t_save:.2f}s")

            DBSession.update_status(session_id, 'processed')

            # ── SIGNAL FRONTEND: pipeline complete ───────────────────────
            if stream:
                stream.mark_done()

            logger.info(f"[timing] total_pipeline: {_time.time() - pipeline_start:.2f}s")
            capture_pipeline_trace(
                session_id, input_type, is_guest, 'success',
                num_events=len(calendar_events),
                has_personalization=use_personalization,
                duration_ms=(_time.time() - pipeline_start) * 1000,
                input_state={"text": text, "input_type": input_type},
                output_state=[
                    e.model_dump() for e in calendar_events
                ],
            )
            flush_posthog()

            # ── BACKGROUND: compute embeddings (non-blocking) ───────────
            # Embeddings are only needed for future similarity search,
            # not for the current session. Compute after signaling done.
            if created_events:
                embed_thread = threading.Thread(
                    target=EventService.compute_embeddings_background,
                    args=(created_events, events_data),
                    daemon=True,
                )
                embed_thread.start()

        except Exception as e:
            error_message = str(e)
            logger.error(
                f"Error processing session {session_id}: {error_message}\n"
                f"{traceback.format_exc()}"
            )
            # Signal SSE stream
            stream = get_stream(session_id)
            if stream:
                stream.mark_error(error_message)
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
        """Process a file session through the pipeline.

        Overlaps context loading (personalization, timezone, calendars) with
        file preprocessing so they run in parallel, saving seconds on file
        sessions where preprocessing can be slow (PDF/audio).
        """
        try:
            # Determine user info for context preloading
            session = DBSession.get_by_id(session_id)
            is_guest = session.get('guest_mode', False) if session else False
            user_id = session.get('user_id', 'anonymous') if session else 'anonymous'

            # Start context loading in parallel with file preprocessing
            context_result = {}
            tz_result = {}

            def _preload_context():
                t0 = _time.time()
                p, h = self._load_personalization_context(user_id, is_guest)
                context_result['patterns'] = p
                context_result['historical_events'] = h
                if p is not None:
                    self.personalize_agent.build_similarity_index(h)

                tz_result['timezone'] = self._get_user_timezone(user_id)

                if not is_guest:
                    try:
                        from database.models import Calendar
                        cals = Calendar.get_by_user(user_id)
                        cal_lookup = {}
                        primary_cal = None
                        for cal in cals:
                            cal_id = cal.get('provider_cal_id')
                            if cal_id:
                                info = {
                                    'name': cal.get('name', cal_id),
                                    'color': cal.get('color', '#1170C5'),
                                }
                                cal_lookup[cal_id] = info
                                if cal.get('is_primary'):
                                    primary_cal = info
                        context_result['calendars_lookup'] = cal_lookup
                        context_result['primary_calendar'] = primary_cal
                    except Exception as e:
                        logger.warning(f"Could not load calendars for SSE enrichment: {e}")
                        context_result['calendars_lookup'] = {}
                        context_result['primary_calendar'] = None
                logger.info(f"[timing] file_preload_context: {_time.time() - t0:.2f}s")

            preload_thread = threading.Thread(target=_preload_context, daemon=True)
            preload_thread.start()

            # File preprocessing (runs in parallel with context loading)
            if file_type == 'audio':
                text = self._transcribe_audio(file_path)
                metadata = {'source': 'audio', 'file_path': file_path}
            elif file_type == 'image':
                text, metadata = self._prepare_image(file_path)
            elif file_type in ('pdf', 'document'):
                text = self._convert_document(file_path)
                metadata = {'source': file_type, 'file_path': file_path}
            elif file_type in ('text', 'email'):
                from pipeline.input.storage import FileStorage
                file_bytes = FileStorage.download_file(file_path)
                text = file_bytes.decode('utf-8', errors='replace')
                if not text.strip():
                    raise ValueError("File is empty or contains no readable text")
                metadata = {'source': file_type, 'file_path': file_path}
            else:
                raise ValueError(f"Unsupported file type: {file_type}")

            # Wait for context loading to finish
            preload_thread.join()
            context_result['timezone'] = tz_result.get('timezone', 'America/New_York')

            # Pass preloaded context to avoid re-loading inside _run_pipeline
            self._run_pipeline(
                session_id, text, input_type=file_type,
                metadata=metadata, preloaded_context=context_result,
            )

        except Exception as e:
            error_message = str(e)
            logger.error(f"Error preprocessing file session {session_id}: {error_message}")
            stream = get_stream(session_id)
            if stream:
                stream.mark_error(error_message)
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
