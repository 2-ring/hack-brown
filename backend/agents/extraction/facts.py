"""
Semantic Fact Extraction Agent (Agent 2)
Extracts structured facts from identified event text.
"""

from typing import List
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from ..base import BaseAgent
from models.agent_models import ExtractedFacts
from logging_utils import log_agent_execution


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
        self.system_prompt = self.load_prompt("extraction.txt")

    @log_agent_execution("Agent2_FactExtraction")
    def execute(
        self,
        raw_text_list: List[str],
        description: str
    ) -> ExtractedFacts:
        """
        Extract semantic facts from event text.

        Args:
            raw_text_list: List of text chunks for the event
            description: Uniquely identifying description of the event

        Returns:
            ExtractedFacts with structured event information
        """
        if not raw_text_list:
            raise ValueError("No raw_text provided for fact extraction")

        # Combine raw_text chunks for processing
        combined_text = ' '.join(raw_text_list)

        fact_extraction_prompt = ChatPromptTemplate.from_messages([
            ("system", self.system_prompt),
            ("human", "Event description: {description}\n\nEvent text: {text}\n\nExtract all semantic facts from this event.")
        ])

        # Run fact extraction
        chain = fact_extraction_prompt | self.llm
        result = chain.invoke({
            "description": description,
            "text": combined_text
        })

        return result
