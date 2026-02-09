"""
Event Extraction Agent (Agent 2)
Reads raw event text and produces a complete, high-quality CalendarEvent.
"""

from typing import List, Optional
from datetime import datetime, timedelta
from pathlib import Path
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from core.base_agent import BaseAgent
from extraction.models import CalendarEvent
from config.posthog import get_invoke_config


class EventExtractionAgent(BaseAgent):
    """
    Extracts facts from raw event text and produces a complete CalendarEvent.
    Second agent in the pipeline (after identification).
    """

    def __init__(self, llm: ChatAnthropic):
        super().__init__("Agent2_EventExtraction")
        self.llm = llm.with_structured_output(CalendarEvent)

        prompt_path = Path(__file__).parent.parent / "prompts" / "extraction.txt"
        with open(prompt_path, 'r') as f:
            self.prompt_template = f.read()

    def execute(
        self,
        raw_text_list: List[str],
        description: str,
        timezone: str = 'America/New_York'
    ) -> CalendarEvent:
        """
        Extract event from raw text and produce a calendar event.

        Args:
            raw_text_list: Text chunks for the event (from Agent 1)
            description: Identifying description of the event (from Agent 1)
            timezone: User's IANA timezone

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

        extraction_prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "Event description: {description}\n\nEvent text: {text}\n\nProduce a complete calendar event.")
        ])

        chain = extraction_prompt | self.llm
        result = chain.invoke({
            "description": description,
            "text": combined_text
        }, config=get_invoke_config("extraction"))

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
