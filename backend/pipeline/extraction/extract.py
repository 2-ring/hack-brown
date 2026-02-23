"""
EXTRACT stage — unified event extraction.

Replaces IDENTIFY + CONSOLIDATE + STRUCTURE in a single LLM call.
Sees the full input context, finds all events, deduplicates, and extracts
structured facts — all at once.

Usage:
    from extraction.extract import UnifiedExtractor

    extractor = UnifiedExtractor(llm, llm_vision=llm_vision)
    result = extractor.execute(text, input_type='text')
    # Returns ExtractedEventBatch with session_title and events
"""

import logging
from typing import List, Optional, Dict

from langchain_core.messages import SystemMessage, HumanMessage

from pipeline.base_agent import BaseAgent
from pipeline.prompt_loader import load_prompt
from pipeline.models import ExtractedEvent, ExtractedEventBatch
from config.posthog import get_invoke_config

logger = logging.getLogger(__name__)

_INPUT_TYPE_LABELS = {
    'text': 'Plain text',
    'image': 'Image (screenshot, photo)',
    'pdf': 'PDF document',
    'audio': 'Audio transcription',
    'email': 'Email',
    'document': 'Document',
}


class UnifiedExtractor(BaseAgent):
    """
    Unified EXTRACT stage — finds all events AND extracts structured facts
    in a single LLM call. Replaces IDENTIFY + CONSOLIDATE + STRUCTURE.
    """

    def __init__(self, llm, llm_vision=None):
        super().__init__("Extract")
        self.llm = llm
        self.llm_vision = llm_vision or llm

    def execute(
        self,
        text: str,
        input_type: str = 'text',
        metadata: Optional[Dict] = None,
    ) -> ExtractedEventBatch:
        """
        Extract all calendar events from raw input in a single LLM call.

        Args:
            text: Raw text input (or placeholder for images)
            input_type: 'text', 'pdf', 'audio', 'email', 'image', 'document'
            metadata: Optional metadata (image_data + media_type for vision path)

        Returns:
            ExtractedEventBatch with session_title and events
        """
        is_vision = metadata and metadata.get('requires_vision')

        if is_vision:
            return self._execute_vision(text, metadata)
        else:
            return self._execute_text(text, input_type)

    def _execute_text(self, text: str, input_type: str) -> ExtractedEventBatch:
        """Text path: single structured output call."""
        system_prompt = load_prompt("pipeline/extraction/prompts/unified_extract.txt")

        source_label = _INPUT_TYPE_LABELS.get(input_type, input_type or 'text')
        user_message = f"[SOURCE TYPE: {source_label}]\n\n{text}"

        structured_llm = self.llm.with_structured_output(
            ExtractedEventBatch, include_raw=True
        )

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_message),
        ]

        raw_result = structured_llm.invoke(
            messages, config=get_invoke_config("extraction")
        )
        result = raw_result['parsed']

        if not result or not result.events:
            return ExtractedEventBatch(session_title="Untitled", input_summary="", events=[])

        logger.info(f"Extracted {len(result.events)} events from {input_type} input")
        return result

    def _execute_vision(self, text: str, metadata: Dict) -> ExtractedEventBatch:
        """Vision path: multimodal message with image."""
        system_prompt = load_prompt("pipeline/extraction/prompts/unified_extract.txt")

        image_data = metadata.get('image_data', '')
        media_type = metadata.get('media_type', 'image/jpeg')

        # Build multimodal message content
        content = [
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{media_type};base64,{image_data}"
                }
            },
            {
                "type": "text",
                "text": "[SOURCE TYPE: Image (screenshot, photo)]\n\n"
                        "Extract all calendar events from this image."
            },
        ]

        structured_llm = self.llm_vision.with_structured_output(
            ExtractedEventBatch, include_raw=True
        )

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=content),
        ]

        raw_result = structured_llm.invoke(
            messages, config=get_invoke_config("extraction")
        )
        result = raw_result['parsed']

        if not result or not result.events:
            return ExtractedEventBatch(session_title="Untitled", input_summary="", events=[])

        logger.info(f"Extracted {len(result.events)} events from image input")
        return result
