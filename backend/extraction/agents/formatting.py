"""
Calendar Formatting Agent (Agent 3)
Formats extracted facts into Google Calendar API format.
"""

from datetime import datetime
from typing import Optional, Dict
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from core.base_agent import BaseAgent
from extraction.models import ExtractedFacts, CalendarEvent


class CalendarFormattingAgent(BaseAgent):
    """
    Formats extracted facts into Google Calendar API format.
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
        self.prompt_template = self.load_prompt("formatting.txt")

    def execute(self, facts: ExtractedFacts, user_preferences: Optional[Dict] = None) -> CalendarEvent:
        """
        Format extracted facts into calendar event.

        Args:
            facts: ExtractedFacts from Agent 2
            user_preferences: Optional dict with user preferences (timezone, date_format)

        Returns:
            CalendarEvent ready for Google Calendar API
        """
        if not facts:
            raise ValueError("No facts provided for calendar formatting")

        # Get current date context for relative date normalization
        current_date = datetime.now().strftime('%Y-%m-%d')
        current_time = datetime.now().strftime('%H:%M:%S')

        # Get timezone from preferences or default to America/New_York
        timezone = 'America/New_York'  # Default fallback
        date_format = 'MM/DD/YYYY'  # Default US format

        if user_preferences:
            timezone = user_preferences.get('timezone', timezone)
            date_format = user_preferences.get('date_format', date_format)

        # Format the system prompt with current context and user preferences
        system_prompt = self.prompt_template.format(
            current_date=current_date,
            current_time=current_time,
            timezone=timezone,
            date_format=date_format
        )

        calendar_formatting_prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "Event facts: {facts}\n\nFormat this event for Google Calendar API.")
        ])

        # Run calendar formatting
        chain = calendar_formatting_prompt | self.llm
        result = chain.invoke({"facts": str(facts.model_dump())})

        return result
