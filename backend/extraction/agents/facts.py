"""
Semantic Fact Extraction Agent (Agent 2)
Extracts structured facts from identified event text.
"""

from typing import List
from datetime import datetime, timedelta
from pathlib import Path
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from core.base_agent import BaseAgent
from extraction.models import ExtractedFacts


class FactExtractionAgent(BaseAgent):
    """
    Extracts structured facts from identified event text.
    Third agent in the pipeline.
    """

    def __init__(self, llm: ChatAnthropic):
        """
        Initialize Fact Extraction Agent.

        Args:
            llm: Language model instance
        """
        super().__init__("Agent2_FactExtraction")
        self.llm = llm.with_structured_output(ExtractedFacts)

        # Load prompt from extraction/prompts directory
        prompt_path = Path(__file__).parent.parent / "prompts" / "facts.txt"
        with open(prompt_path, 'r') as f:
            self.prompt_template = f.read()

    def execute(
        self,
        raw_text_list: List[str],
        description: str
    ) -> ExtractedFacts:
        """
        Extract and normalize semantic facts from event text.

        Args:
            raw_text_list: List of text chunks for the event
            description: Uniquely identifying description of the event

        Returns:
            ExtractedFacts with normalized dates/times
        """
        if not raw_text_list:
            raise ValueError("No raw_text provided for fact extraction")

        # Generate temporal context for date/time normalization
        temporal_context = self._generate_temporal_context()

        # Combine raw_text chunks for processing
        combined_text = ' '.join(raw_text_list)

        # Format system prompt with temporal context
        system_prompt = self.prompt_template.format(
            temporal_context=temporal_context
        )

        fact_extraction_prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "Event description: {description}\n\nEvent text: {text}\n\nExtract and normalize all semantic facts from this event.")
        ])

        # Run fact extraction
        chain = fact_extraction_prompt | self.llm
        result = chain.invoke({
            "description": description,
            "text": combined_text
        })

        return result

    def _generate_temporal_context(self) -> str:
        """Generate temporal context for date/time normalization"""
        now = datetime.now()

        # Calculate next occurrences of each weekday
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
        if days_ahead <= 0:  # Target day already happened this week
            days_ahead += 7
        return date + timedelta(days_ahead)
