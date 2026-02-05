"""
Event Identification Agent (Agent 1)
Identifies distinct calendar events in the input.
"""

from typing import Dict, Any
from pathlib import Path
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from core.base_agent import BaseAgent
from extraction.models import IdentificationResult


class EventIdentificationAgent(BaseAgent):
    """
    Identifies distinct calendar events in the input.
    Second agent in the pipeline.
    """

    def __init__(self, llm: ChatAnthropic):
        """
        Initialize Event Identification Agent.

        Args:
            llm: Language model instance
        """
        super().__init__("Agent1_EventIdentification")
        self.llm = llm.with_structured_output(IdentificationResult)

        # Load prompt from extraction/prompts directory
        prompt_path = Path(__file__).parent.parent / "prompts" / "identification.txt"
        with open(prompt_path, 'r') as f:
            self.prompt_template = f.read()

    def execute(
        self,
        raw_input: str,
        metadata: Dict[str, Any],
        requires_vision: bool = False
    ) -> IdentificationResult:
        """
        Identify all calendar events in the input.
        No context parameter needed - LLM handles context implicitly.

        Args:
            raw_input: Raw text input
            metadata: Additional metadata (may contain image data)
            requires_vision: Whether vision processing is needed

        Returns:
            IdentificationResult with list of identified events
        """
        # Load the system prompt directly (no context guidance needed)
        system_prompt = self.prompt_template

        if requires_vision:
            return self._execute_vision(metadata, system_prompt)
        else:
            return self._execute_text(raw_input, system_prompt)

    def _execute_text(self, raw_input: str, system_prompt: str) -> IdentificationResult:
        """Execute text-only processing"""
        if not raw_input:
            raise ValueError("No input provided for text-only processing")

        identification_prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "{input}")
        ])

        chain = identification_prompt | self.llm
        result = chain.invoke({"input": raw_input})

        return result

    def _execute_vision(self, metadata: Dict[str, Any], system_prompt: str) -> IdentificationResult:
        """Execute vision processing for images/PDFs"""
        content = []

        # Handle single image
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

        # Add identification instruction
        content.append({
            "type": "text",
            "text": "Identify all calendar events in this image/document following the instructions above. Extract complete text chunks for each event."
        })

        # Create messages for vision API
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content}
        ]

        # Use structured output with vision
        result = self.llm.invoke(messages)

        return result
