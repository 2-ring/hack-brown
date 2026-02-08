"""
Parallel event processing pipeline.
Shared by /api/process endpoint and SessionProcessor methods.
"""

import logging
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Any

from config.processing import ProcessingConfig

logger = logging.getLogger(__name__)


@dataclass
class EventProcessingResult:
    """Result of processing a single event through Agent 2 + Agent 3."""
    index: int
    success: bool
    calendar_event: Optional[Any] = None
    facts: Optional[Any] = None
    warning: Optional[str] = None
    error: Optional[Exception] = None


@dataclass
class BatchProcessingResult:
    """Result of processing an entire batch of events."""
    successful_results: List[EventProcessingResult] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    was_truncated: bool = False
    original_count: int = 0
    processed_count: int = 0


def process_events_parallel(
    events: list,
    process_single_event: Callable,
    max_workers: int = None,
    per_event_timeout: int = None,
    batch_timeout: int = None,
) -> BatchProcessingResult:
    """
    Process identified events in parallel through Agent 2 + Agent 3.

    Each event is processed independently. Failed events produce warnings
    but do not affect other events. Event ordering is maintained.

    Args:
        events: List of IdentifiedEvent objects from Agent 1.
        process_single_event: Callable(index, event) -> EventProcessingResult.
            The caller provides this to handle per-event logic since
            /api/process and SessionProcessor have different Agent 3
            invocations and post-processing.
        max_workers: Max concurrent threads (default from ProcessingConfig).
        per_event_timeout: Seconds per event (default from ProcessingConfig).
        batch_timeout: Total seconds for all events (default from ProcessingConfig).

    Returns:
        BatchProcessingResult with ordered results and warnings.
    """
    if max_workers is None:
        max_workers = ProcessingConfig.MAX_WORKERS
    if per_event_timeout is None:
        per_event_timeout = ProcessingConfig.PER_EVENT_TIMEOUT
    if batch_timeout is None:
        batch_timeout = ProcessingConfig.BATCH_TIMEOUT

    # Apply max events cap
    original_count = len(events)
    was_truncated = False
    warnings = []

    if original_count > ProcessingConfig.MAX_EVENTS_PER_REQUEST:
        events = events[:ProcessingConfig.MAX_EVENTS_PER_REQUEST]
        was_truncated = True
        warnings.append(
            ProcessingConfig.get_events_truncation_warning(original_count)
        )
        logger.warning(
            f"Truncated events from {original_count} to "
            f"{ProcessingConfig.MAX_EVENTS_PER_REQUEST}"
        )

    results: List[Optional[EventProcessingResult]] = [None] * len(events)
    effective_workers = min(max_workers, len(events))

    with ThreadPoolExecutor(max_workers=effective_workers) as executor:
        future_to_index = {}
        for idx, event in enumerate(events):
            future = executor.submit(process_single_event, idx, event)
            future_to_index[future] = idx

        try:
            for future in as_completed(future_to_index, timeout=batch_timeout):
                idx = future_to_index[future]
                try:
                    result = future.result(timeout=per_event_timeout)
                    results[idx] = result
                    if result.warning:
                        warnings.append(result.warning)
                except TimeoutError:
                    warning = f"Event {idx + 1}: Processing timed out after {per_event_timeout}s"
                    logger.error(warning)
                    warnings.append(warning)
                    results[idx] = EventProcessingResult(
                        index=idx, success=False, warning=warning
                    )
                except Exception as e:
                    warning = f"Event {idx + 1}: Unexpected error - {str(e)}"
                    logger.error(f"{warning}\n{traceback.format_exc()}")
                    warnings.append(warning)
                    results[idx] = EventProcessingResult(
                        index=idx, success=False, warning=warning, error=e
                    )
        except TimeoutError:
            # Batch timeout exceeded — mark remaining futures as timed out
            for future, idx in future_to_index.items():
                if results[idx] is None:
                    warning = f"Event {idx + 1}: Batch timeout exceeded ({batch_timeout}s)"
                    logger.error(warning)
                    warnings.append(warning)
                    results[idx] = EventProcessingResult(
                        index=idx, success=False, warning=warning
                    )
                    future.cancel()

    successful = [r for r in results if r is not None and r.success]

    return BatchProcessingResult(
        successful_results=successful,
        warnings=warnings,
        was_truncated=was_truncated,
        original_count=original_count,
        processed_count=len(successful),
    )
