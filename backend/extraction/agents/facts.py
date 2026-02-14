"""
Event Extraction Agent (Agent 2)
Reads raw event text and extracts structured facts with natural language
temporal expressions. Temporal resolution is handled downstream by Duckling.

Uses Instructor for automatic Pydantic validation retries.
"""

import time as _time
from typing import List, Optional

from core.base_agent import BaseAgent
from core.prompt_loader import load_prompt
from extraction.models import ExtractedEvent
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

    Second agent in the pipeline (after identification). The temporal
    expressions are resolved to ISO 8601 by the temporal resolver (Duckling)
    before being passed to Agent 3 or the database.

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
        super().__init__("Agent2_EventExtraction")
        self.instructor_client = instructor_client
        self.model_name = model_name
        self.provider = provider
        self.max_retries = max_retries

        self._prompt_path = "extraction/prompts/extraction.txt"

    def execute(
        self,
        raw_text_list: List[str],
        description: str,
        timezone: str = 'America/New_York',
        document_context: Optional[str] = None,
        surrounding_context: Optional[str] = None,
        input_type: Optional[str] = None,
    ) -> ExtractedEvent:
        """
        Extract event from raw text and produce an ExtractedEvent with
        natural language temporal expressions.

        Args:
            raw_text_list: Text chunks for the event (from Agent 1)
            description: Identifying description of the event (from Agent 1)
            timezone: User's IANA timezone (passed to prompt for context)
            document_context: First ~500 chars of source document (headers, course codes, timezone declarations)
            surrounding_context: Text around the extraction span (section headers, adjacent details)
            input_type: Source type ('text', 'pdf', 'audio', 'email', 'document')

        Returns:
            ExtractedEvent with NL temporal expressions (resolved by temporal_resolver downstream)
        """
        if not raw_text_list:
            raise ValueError("No raw_text provided for event extraction")

        combined_text = ' '.join(raw_text_list)

        system_prompt = load_prompt(self._prompt_path, timezone=timezone)

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

        # Layer 4: Event description (Agent 1's interpretation — guide only)
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

        if self.provider in ('grok', 'openai'):
            result = self.instructor_client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                response_model=ExtractedEvent,
                max_retries=self.max_retries,
            )
        else:  # claude
            result = self.instructor_client.messages.create(
                model=self.model_name,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": user_message},
                ],
                response_model=ExtractedEvent,
                max_retries=self.max_retries,
                max_tokens=4096,
            )

        duration_ms = (_time.time() - start) * 1000
        capture_llm_generation("extraction", self.model_name, self.provider, duration_ms)

        return result
