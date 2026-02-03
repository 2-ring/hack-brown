"""
Context Understanding & Intent Analysis Agent (Agent 0)
First agent in the pipeline - understands user intent and provides guidance.
"""

from typing import Dict, Any
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from ..base import BaseAgent
from models.agent_models import ContextResult
from logging_utils import log_agent_execution


class ContextUnderstandingAgent(BaseAgent):
    """
    Understands the user's intent and provides guidance to downstream agents.
    First agent in the pipeline.
    """

    def __init__(self, llm: ChatAnthropic):
        """
        Initialize Context Understanding Agent.

        Args:
            llm: Language model instance
        """
        super().__init__("Agent0_ContextUnderstanding")
        self.llm = llm.with_structured_output(ContextResult)
        self.system_prompt = self.load_prompt("context.txt")

    @log_agent_execution("Agent0_ContextUnderstanding")
    def execute(
        self,
        raw_input: str,
        metadata: Dict[str, Any],
        requires_vision: bool = False
    ) -> ContextResult:
        """
        Analyze input to understand context and intent.

        Args:
            raw_input: Raw text input
            metadata: Additional metadata (may contain image data for vision)
            requires_vision: Whether vision processing is needed

        Returns:
            ContextResult with title, user context, and intent analysis
        """
        if requires_vision:
            return self._execute_vision(metadata)
        else:
            return self._execute_text(raw_input)

    def _execute_text(self, raw_input: str) -> ContextResult:
        """Execute text-only processing"""
        if not raw_input:
            raise ValueError("No input provided for text-only processing")

        context_prompt = ChatPromptTemplate.from_messages([
            ("system", self.system_prompt),
            ("human", "{input}")
        ])

        chain = context_prompt | self.llm
        result = chain.invoke({"input": raw_input})

        return result

    def _execute_vision(self, metadata: Dict[str, Any]) -> ContextResult:
        """Execute vision processing for images/PDFs"""
        content = []

        # Handle single image (from image file)
        if 'image_data' in metadata:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": metadata.get('media_type', 'image/jpeg'),
                    "data": metadata['image_data']
                }
            })

        # Handle multiple pages (from PDF)
        elif 'pages' in metadata:
            for page in metadata['pages']:
                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": page.get('media_type', 'image/jpeg'),
                        "data": page['image_data']
                    }
                })

        # Add analysis instruction
        content.append({
            "type": "text",
            "text": "Analyze this input to understand user intent and context following the instructions above."
        })

        # Create messages for vision API
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": content}
        ]

        # Use structured output with vision
        result = self.llm.invoke(messages)

        return result
