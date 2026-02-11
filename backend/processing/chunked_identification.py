"""
Chunked identification orchestrator.
Splits large text inputs into chunks, runs Agent 1 on each chunk
in parallel, then merges and deduplicates the results.
"""

import logging
from difflib import SequenceMatcher
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError
from typing import List, Optional

from extraction.agents.identification import EventIdentificationAgent
from extraction.models import IdentifiedEvent, IdentificationResult
from processing.text_chunker import split_text
from config.processing import ProcessingConfig
from config.posthog import set_tracking_context, capture_agent_error

logger = logging.getLogger(__name__)


def identify_events_chunked(
    agent: EventIdentificationAgent,
    raw_input: str,
    metadata: dict,
    requires_vision: bool = False,
    tracking_context: Optional[dict] = None,
) -> IdentificationResult:
    """
    Smart identification that chunks large text inputs.

    For inputs below CHUNK_THRESHOLD or requiring vision, delegates directly
    to agent.execute(). For large text inputs, splits into chunks, runs
    Agent 1 in parallel on each chunk, then merges and deduplicates.

    Args:
        agent: The EventIdentificationAgent instance.
        raw_input: Raw text input.
        metadata: Metadata dict (vision data, etc.).
        requires_vision: Whether this is a vision input.
        tracking_context: Optional dict with 'distinct_id' and 'trace_id'
            for PostHog tracking in spawned threads.

    Returns:
        IdentificationResult with deduplicated events.
    """
    if requires_vision:
        return agent.execute(raw_input, metadata, requires_vision=True)

    if not raw_input or len(raw_input) <= ProcessingConfig.CHUNK_THRESHOLD:
        return agent.execute(raw_input, metadata, requires_vision=False)

    # Split text into chunks (with fallback on error)
    try:
        chunks = split_text(raw_input)
    except Exception as e:
        logger.error(f"Text chunking failed, falling back to full text: {e}")
        return agent.execute(raw_input, metadata, requires_vision=False)

    if len(chunks) == 1:
        return agent.execute(raw_input, metadata, requires_vision=False)

    logger.info(
        f"Chunked identification: {len(raw_input)} chars -> {len(chunks)} chunks"
    )

    # Run Agent 1 on each chunk in parallel
    all_events: List[IdentifiedEvent] = []
    max_workers = min(ProcessingConfig.CHUNK_MAX_WORKERS, len(chunks))

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_chunk = {}
        for chunk in chunks:
            future = executor.submit(
                _process_chunk, agent, chunk.text, chunk.chunk_index, tracking_context
            )
            future_to_chunk[future] = chunk

        try:
            for future in as_completed(future_to_chunk, timeout=ProcessingConfig.CHUNK_BATCH_TIMEOUT):
                chunk = future_to_chunk[future]
                try:
                    result = future.result(timeout=ProcessingConfig.CHUNK_PER_TIMEOUT)
                    if result and result.has_events:
                        all_events.extend(result.events)
                except TimeoutError:
                    logger.warning(f"Chunk {chunk.chunk_index}: timed out")
                except Exception as e:
                    logger.warning(f"Chunk {chunk.chunk_index}: error - {e}")
        except TimeoutError:
            logger.warning("Chunked identification: batch timeout exceeded")

    if not all_events:
        logger.info("Chunked identification: no events found in any chunk")
        return IdentificationResult(events=[], num_events=0, has_events=False)

    deduped_events = _deduplicate_events(all_events)

    if len(deduped_events) > ProcessingConfig.MAX_EVENTS_PER_REQUEST:
        logger.warning(
            f"Chunked identification: capping from {len(deduped_events)} "
            f"to {ProcessingConfig.MAX_EVENTS_PER_REQUEST}"
        )
        deduped_events = deduped_events[:ProcessingConfig.MAX_EVENTS_PER_REQUEST]

    logger.info(
        f"Chunked identification: {len(all_events)} raw -> {len(deduped_events)} after dedup"
    )

    return IdentificationResult(
        events=deduped_events,
        num_events=len(deduped_events),
        has_events=True,
    )


def _process_chunk(
    agent: EventIdentificationAgent,
    chunk_text: str,
    chunk_index: int,
    tracking_context: Optional[dict],
) -> Optional[IdentificationResult]:
    """Run Agent 1 on a single chunk in a worker thread."""
    if tracking_context:
        set_tracking_context(
            distinct_id=tracking_context.get('distinct_id'),
            trace_id=tracking_context.get('trace_id'),
            pipeline=tracking_context.get('pipeline'),
            input_type=tracking_context.get('input_type'),
            is_guest=tracking_context.get('is_guest'),
            chunk_index=chunk_index,
        )

    try:
        return agent.execute(chunk_text, {}, requires_vision=False)
    except Exception as e:
        logger.error(f"Chunk {chunk_index} failed: {e}")
        capture_agent_error("identification", e, {'chunk_index': chunk_index})
        raise


def _deduplicate_events(events: List[IdentifiedEvent]) -> List[IdentifiedEvent]:
    """
    Remove duplicate events identified in overlapping chunk regions.

    Compares description fields pairwise using SequenceMatcher. Events with
    similarity >= threshold are merged (higher confidence wins, raw_text unioned).
    O(n^2) which is fine for n <= 25.
    """
    if len(events) <= 1:
        return events

    threshold = ProcessingConfig.DEDUP_SIMILARITY_THRESHOLD
    consumed = set()
    result = []

    for i, event_a in enumerate(events):
        if i in consumed:
            continue

        merged = event_a
        for j in range(i + 1, len(events)):
            if j in consumed:
                continue

            event_b = events[j]
            similarity = SequenceMatcher(
                None,
                merged.description.lower(),
                event_b.description.lower(),
            ).ratio()

            if similarity >= threshold:
                merged = _merge_events(merged, event_b)
                consumed.add(j)

        result.append(merged)

    return result


def _merge_events(a: IdentifiedEvent, b: IdentifiedEvent) -> IdentifiedEvent:
    """Merge two duplicate IdentifiedEvents. Keeps better confidence, unions raw_text."""
    confidence_rank = {'definite': 2, 'tentative': 1}
    a_rank = confidence_rank.get(a.confidence, 0)
    b_rank = confidence_rank.get(b.confidence, 0)

    if b_rank > a_rank:
        primary, secondary = b, a
    elif a_rank > b_rank:
        primary, secondary = a, b
    else:
        primary, secondary = (a, b) if len(a.description) >= len(b.description) else (b, a)

    seen = set()
    merged_raw_text = []
    for chunk in primary.raw_text + secondary.raw_text:
        normalized = chunk.strip()
        if normalized and normalized not in seen:
            seen.add(normalized)
            merged_raw_text.append(chunk)

    return IdentifiedEvent(
        raw_text=merged_raw_text,
        description=primary.description,
        confidence=primary.confidence,
    )
