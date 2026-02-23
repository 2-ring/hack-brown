"""
IDENTIFY stage — finds all calendar events in the input.
See backend/PIPELINE.md for architecture overview.
"""

from typing import Dict, Any, Union
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

from pipeline.base_agent import BaseAgent
from pipeline.prompt_loader import load_prompt
from pipeline.models import IdentificationResult
from config.posthog import get_invoke_config


class EventIdentificationAgent(BaseAgent):
    """
    Identifies distinct calendar events in the input.
    First stage in the pipeline (IDENTIFY).
    Supports both Claude (Anthropic) and Grok/OpenAI vision APIs.
    """

    def __init__(self, llm: Union[ChatAnthropic, ChatOpenAI]):
        """
        Args:
            llm: Language model instance (Claude or Grok/OpenAI)
        """
        super().__init__("Identify")
        self.llm = llm.with_structured_output(IdentificationResult)
        self.base_llm = llm  # Keep reference to detect type

        # Detect LLM type for vision API formatting
        self.is_anthropic = isinstance(llm, ChatAnthropic)
        self.is_openai = isinstance(llm, ChatOpenAI)

        self.prompt_template = load_prompt("pipeline/extraction/prompts/identification.txt")

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
        result = chain.invoke({"input": raw_input}, config=get_invoke_config("identification"))

        return result

    def _execute_vision(self, metadata: Dict[str, Any], system_prompt: str) -> IdentificationResult:
        """
        Execute vision processing for images/PDFs.
        Automatically formats for Claude (Anthropic) or Grok/OpenAI based on LLM type.
        """
        if self.is_anthropic:
            return self._execute_vision_anthropic(metadata, system_prompt)
        elif self.is_openai:
            return self._execute_vision_openai(metadata, system_prompt)
        else:
            raise ValueError(f"Unsupported LLM type: {type(self.base_llm)}")

    def _execute_vision_anthropic(self, metadata: Dict[str, Any], system_prompt: str) -> IdentificationResult:
        """Execute vision processing using Claude's (Anthropic) format"""
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

        # Create messages for Claude API
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content}
        ]

        result = self.llm.invoke(messages, config=get_invoke_config("identification"))
        return result

    def _execute_vision_openai(self, metadata: Dict[str, Any], system_prompt: str) -> IdentificationResult:
        """Execute vision processing using OpenAI/Grok format"""
        content = []

        # Handle single image
        if 'image_data' in metadata:
            media_type = metadata.get('media_type', 'image/jpeg')
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{media_type};base64,{metadata['image_data']}"
                }
            })

        # Handle multiple pages (from PDF)
        elif 'pages' in metadata:
            for page in metadata['pages']:
                media_type = page.get('media_type', 'image/jpeg')
                content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{media_type};base64,{page['image_data']}"
                    }
                })

        # Add identification instruction
        content.append({
            "type": "text",
            "text": "Identify all calendar events in this image/document following the instructions above. Extract complete text chunks for each event."
        })

        # Create messages for OpenAI/Grok API
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content}
        ]

        result = self.llm.invoke(messages, config=get_invoke_config("identification"))
        return result
