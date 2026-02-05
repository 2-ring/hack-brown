"""
Calendar Formatting Agent (Agent 3)
Formats extracted facts into Google Calendar API format and applies user preferences.
"""

from typing import Optional, Dict
from pathlib import Path
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from core.base_agent import BaseAgent
from extraction.models import ExtractedFacts, CalendarEvent


class CalendarFormattingAgent(BaseAgent):
    """
    Formats normalized facts into Google Calendar API format.
    Applies user preferences for calendar selection, title formatting, etc.
    Fourth agent in the pipeline.
    """

    def __init__(self, llm: ChatAnthropic):
        """
        Initialize Calendar Formatting Agent.

        Args:
            llm: Language model instance
        """
        super().__init__("Agent3_CalendarFormatting")
        self.llm = llm.with_structured_output(CalendarEvent)

        # Load prompt from extraction/prompts directory
        prompt_path = Path(__file__).parent.parent / "prompts" / "formatting.txt"
        with open(prompt_path, 'r') as f:
            self.prompt_template = f.read()

    def execute(self, facts: ExtractedFacts, user_preferences: Optional[Dict] = None) -> CalendarEvent:
        """
        Format normalized facts into calendar event with user preferences.

        Args:
            facts: ExtractedFacts from Agent 2 (already normalized)
            user_preferences: Optional dict with user preferences (timezone, discovered patterns)

        Returns:
            CalendarEvent ready for Google Calendar API
        """
        if not facts:
            raise ValueError("No facts provided for calendar formatting")

        # Get timezone from preferences or default to America/New_York
        timezone = 'America/New_York'  # Default fallback

        if user_preferences:
            timezone = user_preferences.get('timezone', timezone)

        # Format the system prompt with timezone
        system_prompt = self.prompt_template.format(
            timezone=timezone
        )

        calendar_formatting_prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "Event facts: {facts}\n\nFormat this event for Google Calendar API, applying user preferences.")
        ])

        # Run calendar formatting
        chain = calendar_formatting_prompt | self.llm
        result = chain.invoke({"facts": str(facts.model_dump())})

        return result
