"""
Event Extraction Agent (Agent 2)
Reads raw event text and produces a complete, high-quality CalendarEvent.
Uses Instructor for automatic Pydantic validation retries.
"""

import time as _time
from typing import List, Optional
from datetime import datetime, timedelta
from pathlib import Path

from core.base_agent import BaseAgent
from extraction.models import CalendarEvent
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
    Extracts facts from raw event text and produces a complete CalendarEvent.
    Second agent in the pipeline (after identification).

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

        prompt_path = Path(__file__).parent.parent / "prompts" / "extraction.txt"
        with open(prompt_path, 'r') as f:
            self.prompt_template = f.read()

    def execute(
        self,
        raw_text_list: List[str],
        description: str,
        timezone: str = 'America/New_York',
        document_context: Optional[str] = None,
        surrounding_context: Optional[str] = None,
        input_type: Optional[str] = None,
    ) -> CalendarEvent:
        """
        Extract event from raw text and produce a calendar event.

        Args:
            raw_text_list: Text chunks for the event (from Agent 1)
            description: Identifying description of the event (from Agent 1)
            timezone: User's IANA timezone
            document_context: First ~500 chars of source document (headers, course codes, timezone declarations)
            surrounding_context: Text around the extraction span (section headers, adjacent details)
            input_type: Source type ('text', 'pdf', 'audio', 'email', 'document')

        Returns:
            CalendarEvent ready for calendar API (or personalization)
        """
        if not raw_text_list:
            raise ValueError("No raw_text provided for event extraction")

        temporal_context = self._generate_temporal_context()
        combined_text = ' '.join(raw_text_list)

        system_prompt = self.prompt_template.format(
            temporal_context=temporal_context,
            timezone=timezone
        )

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

        parts.append("Produce a complete calendar event.")

        return "\n\n".join(parts)

    def _invoke_instructor(self, system_prompt: str, user_message: str) -> CalendarEvent:
        """Call Instructor with provider-appropriate API and capture to PostHog."""
        start = _time.time()

        if self.provider in ('grok', 'openai'):
            result = self.instructor_client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                response_model=CalendarEvent,
                max_retries=self.max_retries,
            )
        else:  # claude
            result = self.instructor_client.messages.create(
                model=self.model_name,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": user_message},
                ],
                response_model=CalendarEvent,
                max_retries=self.max_retries,
                max_tokens=4096,
            )

        duration_ms = (_time.time() - start) * 1000
        capture_llm_generation("extraction", self.model_name, self.provider, duration_ms)

        return result

    def _generate_temporal_context(self) -> str:
        """Generate temporal context for date/time resolution"""
        now = datetime.now()

        weekdays = []
        for i in range(7):
            next_day = self._get_next_weekday(now, i)
            day_name = next_day.strftime('%A')
            date_str = next_day.strftime('%Y-%m-%d')
            weekdays.append(f"  - Next {day_name}: {date_str}")

        temporal_context = f"""[CURRENT_CONTEXT]
Today: {now.strftime('%Y-%m-%d')} ({now.strftime('%A')})
Tomorrow: {(now + timedelta(days=1)).strftime('%Y-%m-%d')}
Yesterday: {(now - timedelta(days=1)).strftime('%Y-%m-%d')}

Next weekdays:
{chr(10).join(weekdays)}

This week: {(now - timedelta(days=now.weekday())).strftime('%Y-%m-%d')} to {(now + timedelta(days=6-now.weekday())).strftime('%Y-%m-%d')}
Next week starts: {(now + timedelta(days=7-now.weekday())).strftime('%Y-%m-%d')}

Current time: {now.strftime('%H:%M:%S')}
[/CURRENT_CONTEXT]"""
        return temporal_context

    def _get_next_weekday(self, date: datetime, weekday: int) -> datetime:
        """Get next occurrence of weekday (0=Monday, 6=Sunday)"""
        days_ahead = weekday - date.weekday()
        if days_ahead <= 0:
            days_ahead += 7
        return date + timedelta(days_ahead)
