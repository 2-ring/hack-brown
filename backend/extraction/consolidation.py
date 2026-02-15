"""
CONSOLIDATE stage — groups events, removes duplicates, produces cross-event context.

Single lightweight LLM call that sees all identified events holistically.
Runs after IDENTIFY (LangExtract / Agent 1), before STRUCTURE (Agent 2).

See backend/PIPELINE.md for architecture overview.
"""

import time as _time
import logging
from typing import List

from core.prompt_loader import load_prompt
from extraction.models import IdentifiedEvent, ConsolidationResult
from config.posthog import capture_llm_generation

logger = logging.getLogger(__name__)


def _build_event_summary(events: List[IdentifiedEvent]) -> str:
    """Build a numbered summary of all events for the LLM to review."""
    lines = []
    for i, event in enumerate(events):
        raw = ' '.join(event.raw_text)
        # Truncate raw text to keep input small
        if len(raw) > 200:
            raw = raw[:200] + "..."
        lines.append(f"[{i}] {event.description}\n    Raw: {raw}")
    return "\n\n".join(lines)


def consolidate_events(
    events: List[IdentifiedEvent],
    instructor_client,
    model_name: str,
    provider: str,
) -> ConsolidationResult:
    """
    CONSOLIDATE stage: group events, remove duplicates, produce cross-event context.

    Args:
        events: List of IdentifiedEvent objects from IDENTIFY stage
        instructor_client: Instructor-patched client (from create_instructor_client)
        model_name: Model name string
        provider: Provider name ('grok', 'claude', 'openai')

    Returns:
        ConsolidationResult with group assignments and cross-event context
    """
    system_prompt = load_prompt("extraction/prompts/consolidation.txt")
    user_message = _build_event_summary(events)

    start = _time.time()
    input_tokens = None
    output_tokens = None

    if provider in ('grok', 'openai'):
        result, completion = instructor_client.chat.completions.create_with_completion(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            response_model=ConsolidationResult,
            max_retries=2,
        )
        try:
            input_tokens = completion.usage.prompt_tokens
            output_tokens = completion.usage.completion_tokens
        except (AttributeError, TypeError):
            pass
    else:  # claude
        result, completion = instructor_client.messages.create_with_completion(
            model=model_name,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_message},
            ],
            response_model=ConsolidationResult,
            max_retries=2,
            max_tokens=4096,
        )
        try:
            input_tokens = completion.usage.input_tokens
            output_tokens = completion.usage.output_tokens
        except (AttributeError, TypeError):
            pass

    duration_ms = (_time.time() - start) * 1000
    capture_llm_generation(
        "consolidation", model_name, provider, duration_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        input_content=user_message,
        output_content=result.model_dump_json(),
    )

    # Log summary
    kept = sum(1 for a in result.assignments if a.keep)
    removed = sum(1 for a in result.assignments if not a.keep)
    categories = set(a.category for a in result.assignments if a.keep)
    logger.info(
        f"CONSOLIDATE: {kept} kept, {removed} removed, "
        f"{len(categories)} groups: {sorted(categories)}"
    )
    if removed > 0:
        for a in result.assignments:
            if not a.keep:
                logger.info(f"  Removed event [{a.event_index}]: {a.removal_reason}")

    return result


def build_groups(
    events: List[IdentifiedEvent],
    result: ConsolidationResult,
) -> dict:
    """
    Build a dict of {category: [IdentifiedEvent, ...]} from consolidation result.
    Only includes events with keep=True.

    Returns:
        dict mapping category name to list of (original_index, IdentifiedEvent) tuples
    """
    groups = {}
    for assignment in result.assignments:
        if not assignment.keep:
            continue
        category = assignment.category
        if category not in groups:
            groups[category] = []
        groups[category].append((assignment.event_index, events[assignment.event_index]))
    return groups
