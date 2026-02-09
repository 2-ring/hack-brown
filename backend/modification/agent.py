"""
Event Modification Agent
Applies user edit instructions across a set of calendar events.
Returns only the events that need to change (edit or delete).
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from langchain_core.prompts import ChatPromptTemplate

from core.base_agent import BaseAgent
from extraction.models import ModificationResult
from config.posthog import get_invoke_config


class EventModificationAgent(BaseAgent):
    """
    Receives all session events + a natural-language instruction.
    Returns a ModificationResult with only the affected events.
    """

    def __init__(self, llm):
        super().__init__("Agent4_EventModification")
        self.llm = llm.with_structured_output(ModificationResult)
        self.prompt_template = self.load_prompt("modification.txt")

    def execute(
        self,
        events: List[Dict[str, Any]],
        instruction: str,
        calendar_names: Optional[List[str]] = None
    ) -> ModificationResult:
        """
        Apply a natural-language instruction to a list of events.

        Args:
            events: List of CalendarEvent dicts (the full session)
            instruction: User's edit request
            calendar_names: Available calendar names the user has

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

        # Build calendars context
        calendars_block = ""
        if calendar_names:
            calendars_block = f"\n\nAVAILABLE CALENDARS:\n{', '.join(calendar_names)}\nWhen moving events between calendars, only use these names."

        system_prompt = self.prompt_template.format(
            current_date=current_date,
            current_time=current_time
        )

        chain = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "EVENTS:\n{events}{calendars}\n\nINSTRUCTION:\n{instruction}")
        ]) | self.llm

        result = chain.invoke({
            "events": events_block,
            "calendars": calendars_block,
            "instruction": instruction
        }, config=get_invoke_config("modification"))

        return result
