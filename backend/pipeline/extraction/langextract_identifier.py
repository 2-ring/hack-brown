"""
LangExtract-based event identification.
Replaces chunked_identification.py for text inputs.
Handles chunking, multi-pass extraction, and source grounding internally.

Model/provider is read from config/text.py via config/langextract.py,
so switching presets also switches what LangExtract uses.
"""

import time as _time
import logging
from typing import Optional

import langextract as lx
from langextract.providers import load_builtins_once

from pipeline.models import IdentifiedEvent, IdentificationResult
from config.langextract import (
    get_langextract_config,
    EXAMPLES, PROMPT_DESCRIPTION, MAX_CHAR_BUFFER, MAX_WORKERS,
    PASSES_SIMPLE, DOCUMENT_CONTEXT_CHARS, SURROUNDING_CONTEXT_CHARS,
)
from config.posthog import capture_llm_generation, capture_agent_error
from config.processing import ProcessingConfig

logger = logging.getLogger(__name__)


def identify_events_langextract(
    text: str,
    extraction_passes: int = None,
    tracking_context: Optional[dict] = None,
    input_type: str = 'text',
) -> IdentificationResult:
    """
    Identify calendar events using LangExtract.

    Handles chunking, multi-pass extraction, source grounding, and
    deduplication internally via LangExtract.

    Args:
        text: Input text to extract events from.
        extraction_passes: Number of extraction passes (1 or 2).
            If None, defaults to PASSES_SIMPLE.
        tracking_context: Optional dict for PostHog tracking.
        input_type: Source type ('text', 'pdf', 'audio', 'email', 'document').
            Forwarded to IdentifiedEvent for STRUCTURE stage context.

    Returns:
        IdentificationResult with identified events.

    Raises:
        ValueError: If the configured provider is not supported by LangExtract.
            The caller should catch this and fall back to chunked_identification.
    """
    if not text or not text.strip():
        return IdentificationResult(events=[], num_events=0, has_events=False)

    passes = extraction_passes or PASSES_SIMPLE
    start = _time.time()

    try:
        # Build config from centralized text.py settings.
        # Raises ValueError if provider is unsupported (e.g. 'claude').
        config, model_name, provider_name = get_langextract_config()

        # Ensure builtin providers (OpenAI, Gemini, Ollama) are registered.
        # Required before lx.extract() when fence_output is set, as the
        # _create_model_with_schema path doesn't auto-load providers.
        load_builtins_once()

        # Call LangExtract with explicit provider config.
        # fence_output=True and use_schema_constraints=False are required
        # for OpenAI-compatible (non-Gemini) providers.
        result = lx.extract(
            text_or_documents=text,
            prompt_description=PROMPT_DESCRIPTION,
            examples=EXAMPLES,
            config=config,
            extraction_passes=passes,
            max_char_buffer=MAX_CHAR_BUFFER,
            max_workers=MAX_WORKERS,
            fence_output=True,
            use_schema_constraints=False,
        )

        duration_ms = (_time.time() - start) * 1000

        # Map LangExtract extractions to IdentifiedEvent models.
        # For string input, result is a single AnnotatedDocument.
        # Pass original text so the mapper can compute context windows
        # from char_interval grounding data.
        events = _map_extractions_to_events(result, input_type=input_type)

        # Cap events
        if len(events) > ProcessingConfig.MAX_EVENTS_PER_REQUEST:
            logger.warning(
                f"LangExtract: capping from {len(events)} to "
                f"{ProcessingConfig.MAX_EVENTS_PER_REQUEST}"
            )
            events = events[:ProcessingConfig.MAX_EVENTS_PER_REQUEST]

        logger.info(
            f"LangExtract identification: {len(text)} chars, "
            f"{passes} pass(es), {len(events)} events, "
            f"{duration_ms:.0f}ms"
        )

        # PostHog tracking (uses actual model/provider from centralized config)
        # LangExtract doesn't expose token usage, so tokens are unavailable.
        output_summary = [
            {'description': e.description, 'raw_text': e.raw_text[:200]}
            for e in events
        ]
        capture_llm_generation(
            "identification", model_name, provider_name,
            duration_ms,
            input_content=[
                {"role": "user", "content": text[:2000]},
            ],
            output_content=str(output_summary),
            properties={
                'extraction_passes': passes,
                'num_events_found': len(events),
                'input_length': len(text),
                'engine': 'langextract',
            }
        )

        return IdentificationResult(
            events=events,
            num_events=len(events),
            has_events=len(events) > 0,
        )

    except Exception as e:
        duration_ms = (_time.time() - start) * 1000
        logger.error(f"LangExtract identification failed: {e}")
        capture_agent_error("identification", e, {
            'extraction_passes': passes,
            'input_length': len(text),
        })
        raise


def _map_extractions_to_events(result, input_type: str = 'text') -> list:
    """
    Map LangExtract AnnotatedDocument extractions to IdentifiedEvent list,
    enriching each event with document-level and local context windows
    computed from LangExtract's source grounding data.

    LangExtract Extraction has:
      - extraction_text: str (verbatim source span)
      - attributes: dict (description, confidence)
      - char_interval: CharInterval(start_pos, end_pos) — source grounding

    IdentifiedEvent gets:
      - raw_text: List[str]           (the verbatim span)
      - description: str              (LLM-generated summary from IDENTIFY)
      - confidence: str
      - document_context: str | None  (first ~500 chars — headers, course names, timezone)
      - surrounding_context: str | None (text around the span — section headers, adjacent details)
      - input_type: str | None        (source type signal for STRUCTURE stage)
    """
    events = []

    # For string input, result is a single AnnotatedDocument.
    # For iterable input, it's a list. Handle both defensively.
    if isinstance(result, list):
        all_extractions = []
        original_text = None
        for doc in result:
            if doc and doc.text and not original_text:
                original_text = doc.text
            if doc and doc.extractions:
                all_extractions.extend(doc.extractions)
    else:
        original_text = result.text if result else None
        all_extractions = result.extractions if result and result.extractions else []

    # Document context: first N chars of the original text.
    # Captures headers, course codes, timezone declarations, shared locations.
    document_context = None
    if original_text and len(original_text) > DOCUMENT_CONTEXT_CHARS:
        document_context = original_text[:DOCUMENT_CONTEXT_CHARS].strip()

    for extraction in all_extractions:
        raw_text = extraction.extraction_text or ""
        if not raw_text.strip():
            continue

        # Surrounding context: expand the extraction span using char_interval.
        # Captures section headers, adjacent sentences, nearby details.
        surrounding_context = None
        if original_text and extraction.char_interval:
            start = extraction.char_interval.start_pos
            end = extraction.char_interval.end_pos
            if start is not None and end is not None:
                ctx_start = max(0, start - SURROUNDING_CONTEXT_CHARS)
                ctx_end = min(len(original_text), end + SURROUNDING_CONTEXT_CHARS)
                surrounding = original_text[ctx_start:ctx_end].strip()
                # Only include if it actually adds info beyond the event span
                if len(surrounding) > len(raw_text) + 50:
                    surrounding_context = surrounding

        attrs = extraction.attributes or {}
        description = attrs.get("description", raw_text[:100])
        confidence = attrs.get("confidence", "definite")

        if confidence not in ("definite", "tentative"):
            confidence = "definite"

        events.append(IdentifiedEvent(
            raw_text=[raw_text],
            description=description,
            confidence=confidence,
            document_context=document_context,
            surrounding_context=surrounding_context,
            input_type=input_type,
        ))

    return events
