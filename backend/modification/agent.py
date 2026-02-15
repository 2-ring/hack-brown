"""
Event Modification Agent
Applies user edit instructions across a set of calendar events.
Returns only the events that need to change (edit or delete).
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage

from core.base_agent import BaseAgent
from core.prompt_loader import load_prompt
from extraction.models import ModificationResult
from config.posthog import get_invoke_config


class EventModificationAgent(BaseAgent):
    """
    Receives all session events + a natural-language instruction.
    Returns a ModificationResult with only the affected events.
    """

    def __init__(self, llm):
        super().__init__("Agent4_EventModification")
        # Copy LLM and set descriptive name for PostHog traces
        named_llm = llm.model_copy()
        named_llm.name = "Agent 4: Modification"
        self.llm = named_llm.with_structured_output(ModificationResult)
        self._prompt_path = "modification/prompts/modification.txt"

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

        result = self.llm.invoke(messages, config=get_invoke_config("modification"))

        return result
