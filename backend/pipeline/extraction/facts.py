"""
STRUCTURE stage — extracts structured facts from raw event text.
Produces natural language temporal expressions; resolution is handled
downstream by the RESOLVE stage (Duckling).

Uses Instructor for automatic Pydantic validation retries.
See backend/PIPELINE.md for architecture overview.
"""

import time as _time
from typing import List, Optional

from pipeline.base_agent import BaseAgent
from pipeline.prompt_loader import load_prompt
from pipeline.models import ExtractedEvent, ExtractedEventBatch, IdentifiedEvent
from config.posthog import capture_llm_generation

# Human-readable labels for input types, shown in user message
_INPUT_TYPE_LABELS = {
    'text': 'text',
    'pdf': 'PDF document',
    'audio': 'audio transcription',
    'email': 'email',
    'image': 'image',
    'document': 'document',
}


class EventExtractionAgent(BaseAgent):
    """
    Extracts facts from raw event text and produces an ExtractedEvent
    with natural language temporal expressions.

    STRUCTURE stage (after IDENTIFY, CONSOLIDATE). The temporal
    expressions are resolved to ISO 8601 by the RESOLVE stage (Duckling)
    before being passed to PERSONALIZE or the database.

    Uses Instructor to wrap the raw LLM client so that Pydantic validation
    errors are automatically fed back to the LLM for retry (max_retries=2).
    """

    def __init__(self, instructor_client, model_name: str, provider: str, max_retries: int = 2):
        """
        Args:
            instructor_client: Instructor-patched client (from create_instructor_client)
            model_name: Model name string (e.g., 'grok-3')
            provider: Provider name ('grok', 'claude', 'openai')
            max_retries: Max Pydantic validation retries (default 2)
        """
        super().__init__("Structure")
        self.instructor_client = instructor_client
        self.model_name = model_name
        self.provider = provider
        self.max_retries = max_retries

        self._prompt_path = "pipeline/extraction/prompts/extraction.txt"

    def execute(
        self,
        raw_text_list: List[str],
        description: str,
        document_context: Optional[str] = None,
        surrounding_context: Optional[str] = None,
        input_type: Optional[str] = None,
    ) -> ExtractedEvent:
        """
        Extract event from raw text and produce an ExtractedEvent with
        natural language temporal expressions.

        Args:
            raw_text_list: Text chunks for the event (from IDENTIFY stage)
            description: Identifying description of the event (from IDENTIFY stage)
            document_context: First ~500 chars of source document (headers, course codes, timezone declarations)
            surrounding_context: Text around the extraction span (section headers, adjacent details)
            input_type: Source type ('text', 'pdf', 'audio', 'email', 'document')

        Returns:
            ExtractedEvent with NL temporal expressions (resolved by temporal_resolver downstream)
        """
        if not raw_text_list:
            raise ValueError("No raw_text provided for event extraction")

        combined_text = ' '.join(raw_text_list)

        system_prompt = load_prompt(self._prompt_path)

        user_message = self._build_user_message(
            event_text=combined_text,
            description=description,
            document_context=document_context,
            surrounding_context=surrounding_context,
            input_type=input_type,
        )

        return self._invoke_instructor(system_prompt, user_message)

    def _build_user_message(
        self,
        event_text: str,
        description: str,
        document_context: Optional[str] = None,
        surrounding_context: Optional[str] = None,
        input_type: Optional[str] = None,
    ) -> str:
        """
        Build the structured user message with context layers.

        Includes only the layers that are present and add information
        beyond the event text itself.
        """
        parts = []

        # Layer 1: Document context (global — course codes, timezones, shared locations)
        if document_context:
            source_label = _INPUT_TYPE_LABELS.get(input_type, input_type or 'text')
            parts.append(
                f"[DOCUMENT CONTEXT]\n"
                f"Source type: {source_label}\n"
                f"---\n"
                f"{document_context}\n"
                f"[/DOCUMENT CONTEXT]"
            )

        # Layer 2: Surrounding context (local — section headers, adjacent sentences)
        if surrounding_context:
            parts.append(
                f"[SURROUNDING CONTEXT]\n"
                f"{surrounding_context}\n"
                f"[/SURROUNDING CONTEXT]"
            )

        # Layer 3: Event text (source of truth)
        parts.append(
            f"[EVENT TEXT]\n"
            f"{event_text}\n"
            f"[/EVENT TEXT]"
        )

        # Layer 4: Event description (IDENTIFY stage's interpretation — guide only)
        parts.append(
            f"[EVENT DESCRIPTION]\n"
            f"{description}\n"
            f"[/EVENT DESCRIPTION]"
        )

        parts.append("Extract the event details and temporal expressions.")

        return "\n\n".join(parts)

    def _invoke_instructor(self, system_prompt: str, user_message: str) -> ExtractedEvent:
        """Call Instructor with provider-appropriate API and capture to PostHog."""
        start = _time.time()

        input_tokens = None
        output_tokens = None

        if self.provider in ('grok', 'openai'):
            result, completion = self.instructor_client.chat.completions.create_with_completion(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                response_model=ExtractedEvent,
                max_retries=self.max_retries,
            )
            try:
                input_tokens = completion.usage.prompt_tokens
                output_tokens = completion.usage.completion_tokens
            except (AttributeError, TypeError):
                pass
        else:  # claude
            result, completion = self.instructor_client.messages.create_with_completion(
                model=self.model_name,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": user_message},
                ],
                response_model=ExtractedEvent,
                max_retries=self.max_retries,
                max_tokens=4096,
            )
            try:
                input_tokens = completion.usage.input_tokens
                output_tokens = completion.usage.output_tokens
            except (AttributeError, TypeError):
                pass

        duration_ms = (_time.time() - start) * 1000
        capture_llm_generation(
            "extraction", self.model_name, self.provider, duration_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            input_content=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            output_content=result.model_dump_json(),
        )

        return result

    # ========================================================================
    # Batch mode (STRUCTURE stage — per-group extraction)
    # ========================================================================

    def execute_batch(
        self,
        events: List[IdentifiedEvent],
        cross_event_context: str,
        document_context: Optional[str] = None,
        input_type: Optional[str] = None,
    ) -> List[ExtractedEvent]:
        """
        Extract facts for a GROUP of related events in a single LLM call.
        Ensures naming consistency, description style, and recurrence handling
        across all events in the group.

        Args:
            events: List of IdentifiedEvent objects (all in the same group)
            cross_event_context: Blurb about inter-event dependencies/conflicts
            document_context: First ~500 chars of source document
            input_type: Source type ('text', 'pdf', 'audio', etc.)

        Returns:
            List[ExtractedEvent] — one per input event, same order
        """
        if not events:
            raise ValueError("No events provided for batch extraction")

        system_prompt = load_prompt("pipeline/extraction/prompts/extraction_batch.txt")
        user_message = self._build_batch_user_message(
            events=events,
            cross_event_context=cross_event_context,
            document_context=document_context,
            input_type=input_type,
        )

        result = self._invoke_instructor_batch(system_prompt, user_message)
        return result.events

    def _build_batch_user_message(
        self,
        events: List[IdentifiedEvent],
        cross_event_context: str,
        document_context: Optional[str] = None,
        input_type: Optional[str] = None,
    ) -> str:
        """Build the user message for batch extraction."""
        parts = []

        # Cross-event context (from CONSOLIDATE stage)
        parts.append(
            f"[CROSS-EVENT CONTEXT]\n"
            f"{cross_event_context}\n"
            f"[/CROSS-EVENT CONTEXT]"
        )

        # Document context (global — course codes, timezones, shared locations)
        if document_context:
            source_label = _INPUT_TYPE_LABELS.get(input_type, input_type or 'text')
            parts.append(
                f"[DOCUMENT CONTEXT]\n"
                f"Source type: {source_label}\n"
                f"---\n"
                f"{document_context}\n"
                f"[/DOCUMENT CONTEXT]"
            )

        # Event list (numbered)
        event_lines = []
        for i, event in enumerate(events):
            combined_text = ' '.join(event.raw_text)
            event_lines.append(
                f"[EVENT {i}]\n"
                f"Description: {event.description}\n"
                f"Raw text: {combined_text}\n"
                f"[/EVENT {i}]"
            )
        parts.append("\n\n".join(event_lines))

        parts.append(
            f"Extract all {len(events)} events. Output exactly {len(events)} ExtractedEvent objects in the same order."
        )

        return "\n\n".join(parts)

    def _invoke_instructor_batch(self, system_prompt: str, user_message: str) -> ExtractedEventBatch:
        """Call Instructor for batch extraction with provider-appropriate API."""
        start = _time.time()

        input_tokens = None
        output_tokens = None

        if self.provider in ('grok', 'openai'):
            result, completion = self.instructor_client.chat.completions.create_with_completion(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                response_model=ExtractedEventBatch,
                max_retries=self.max_retries,
            )
            try:
                input_tokens = completion.usage.prompt_tokens
                output_tokens = completion.usage.completion_tokens
            except (AttributeError, TypeError):
                pass
        else:  # claude
            result, completion = self.instructor_client.messages.create_with_completion(
                model=self.model_name,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": user_message},
                ],
                response_model=ExtractedEventBatch,
                max_retries=self.max_retries,
                max_tokens=8192,
            )
            try:
                input_tokens = completion.usage.input_tokens
                output_tokens = completion.usage.output_tokens
            except (AttributeError, TypeError):
                pass

        duration_ms = (_time.time() - start) * 1000
        capture_llm_generation(
            "extraction_batch", self.model_name, self.provider, duration_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            input_content=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            output_content=result.model_dump_json(),
        )

        return result
