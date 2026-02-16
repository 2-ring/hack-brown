"""
MODIFY — applies user edit instructions across a set of calendar events.
Returns only the events that need to change (edit or delete).
Separate from the main pipeline (IDENTIFY → CONSOLIDATE → STRUCTURE → RESOLVE → PERSONALIZE).
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
import time as _time
from langchain_core.messages import SystemMessage, HumanMessage

from core.base_agent import BaseAgent
from core.prompt_loader import load_prompt
from extraction.models import ModificationResult
from config.posthog import capture_llm_generation


class EventModificationAgent(BaseAgent):
    """
    Receives all session events + a natural-language instruction.
    Returns a ModificationResult with only the affected events.
    """

    def __init__(self, llm):
        super().__init__("Modify")
        self.llm = llm.with_structured_output(ModificationResult, include_raw=True)
        self._prompt_path = "modification/prompts/modification.txt"

        # Resolve provider/model for manual PostHog capture
        from config.text import get_text_provider, get_model_specs
        self._provider = get_text_provider('modify')
        self._model_name = get_model_specs(self._provider)['model_name']

    def execute(
        self,
        events: List[Dict[str, Any]],
        instruction: str,
        calendars: Optional[List[Dict[str, str]]] = None
    ) -> ModificationResult:
        """
        Apply a natural-language instruction to a list of events.

        Args:
            events: List of CalendarEvent dicts (the full session)
            instruction: User's edit request
            calendars: Available calendars as [{id, name}] dicts

        Returns:
            ModificationResult with actions for affected events only
        """
        if not events:
            raise ValueError("No events provided for modification")
        if not instruction:
            raise ValueError("No edit instruction provided")

        current_date = datetime.now().strftime('%Y-%m-%d')
        current_time = datetime.now().strftime('%H:%M:%S')

        # Build numbered event list for the prompt
        event_lines = []
        for i, event in enumerate(events):
            event_lines.append(f"[{i}] {event}")
        events_block = "\n\n".join(event_lines)

        # Build calendars context with IDs so the LLM outputs correct IDs
        calendars_block = ""
        if calendars:
            cal_lines = [f"- {c['name']} (ID: {c['id']})" for c in calendars]
            calendars_block = f"\n\nAVAILABLE CALENDARS:\n" + "\n".join(cal_lines) + "\nWhen moving events between calendars, set the 'calendar' field to the calendar ID (not the name)."

        system_prompt = load_prompt(
            self._prompt_path,
            current_date=current_date,
            current_time=current_time,
        )

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"EVENTS:\n{events_block}{calendars_block}\n\nINSTRUCTION:\n{instruction}"),
        ]

        start = _time.time()
        raw_result = self.llm.invoke(messages)
        duration_ms = (_time.time() - start) * 1000
        result = raw_result['parsed']

        # Manual PostHog capture (flat — no chain wrapper)
        input_tokens = None
        output_tokens = None
        try:
            usage = raw_result['raw'].usage_metadata
            input_tokens = usage.get('input_tokens')
            output_tokens = usage.get('output_tokens')
        except (AttributeError, TypeError):
            pass
        capture_llm_generation(
            "modification", self._model_name, self._provider, duration_ms,
            input_tokens=input_tokens, output_tokens=output_tokens,
            input_content=instruction,
            output_content=result.model_dump_json(),
        )

        return result
