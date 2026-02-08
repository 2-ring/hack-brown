"""
Event Modification Agent
Modifies existing calendar events based on natural language instructions.
"""

from typing import Dict, Any
from datetime import datetime
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from core.base_agent import BaseAgent
from extraction.models import CalendarEvent
from config.posthog import get_invoke_config


class EventModificationAgent(BaseAgent):
    """
    Modifies existing calendar events based on natural language instructions.
    Used for editing events after creation.
    """

    def __init__(self, llm: ChatAnthropic):
        """
        Initialize Event Modification Agent.

        Args:
            llm: Language model instance
        """
        super().__init__("Agent4_EventModification")
        self.llm = llm.with_structured_output(CalendarEvent)
        self.prompt_template = self.load_prompt("modification.txt")

    def execute(
        self,
        original_event: Dict[str, Any],
        edit_instruction: str
    ) -> CalendarEvent:
        """
        Apply natural language edit to an existing event.

        Args:
            original_event: Existing calendar event data
            edit_instruction: User's natural language edit request

        Returns:
            Modified CalendarEvent
        """
        if not original_event:
            raise ValueError("No original event provided for modification")

        if not edit_instruction:
            raise ValueError("No edit instruction provided")

        # Get current date context for relative date calculations
        current_date = datetime.now().strftime('%Y-%m-%d')
        current_time = datetime.now().strftime('%H:%M:%S')

        # Format the system prompt with current context
        system_prompt = self.prompt_template.format(
            current_date=current_date,
            current_time=current_time
        )

        event_modification_prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "Original Event:\n{original_event}\n\nUser's Edit Instruction:\n{edit_instruction}\n\nApply the edit and return the modified event.")
        ])

        # Run event modification
        chain = event_modification_prompt | self.llm
        result = chain.invoke({
            "original_event": str(original_event),
            "edit_instruction": edit_instruction
        }, config=get_invoke_config())

        return result
