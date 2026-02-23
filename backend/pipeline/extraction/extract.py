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
import time as _time
from typing import List, Optional, Dict

from langchain_core.messages import SystemMessage, HumanMessage

from pipeline.base_agent import BaseAgent
from pipeline.prompt_loader import load_prompt
from pipeline.models import ExtractedEvent, ExtractedEventBatch
from config.posthog import capture_llm_generation

logger = logging.getLogger(__name__)

_INPUT_TYPE_LABELS = {
    'text': 'Plain text',
    'image': 'Image (screenshot, photo)',
    'pdf': 'PDF document',
    'audio': 'Audio transcription',
    'email': 'Email',
    'document': 'Document',
}

# LangChain message type → OpenAI-style role
_ROLE_MAP = {"system": "system", "human": "user", "ai": "assistant"}


def _capture_generation(agent_name, messages, raw_ai_message, duration_ms):
    """Capture a manual $ai_generation event with full LLM I/O for PostHog."""
    try:
        from config.text import get_text_provider, get_model_specs
        from config.posthog import _PROVIDER_TO_POSTHOG

        component = 'extract'
        provider = get_text_provider(component)
        specs = get_model_specs(provider)
        model_name = specs['model_name']
        posthog_provider = _PROVIDER_TO_POSTHOG.get(provider, provider)

        # Serialize input messages
        input_messages = [
            {"role": _ROLE_MAP.get(m.type, m.type), "content": m.content}
            for m in messages
        ]

        # Serialize output — content for JSON mode, tool_calls for tool-calling mode
        output = None
        if raw_ai_message:
            if raw_ai_message.content:
                output = raw_ai_message.content
            elif hasattr(raw_ai_message, 'tool_calls') and raw_ai_message.tool_calls:
                import json
                output = json.dumps(raw_ai_message.tool_calls, default=str)

        # Token counts from usage_metadata
        usage = getattr(raw_ai_message, 'usage_metadata', None) or {}

        capture_llm_generation(
            agent_name='extraction',
            model=model_name,
            provider=posthog_provider,
            duration_ms=duration_ms,
            input_tokens=usage.get('input_tokens'),
            output_tokens=usage.get('output_tokens'),
            input_content=input_messages,
            output_content=output,
        )
    except Exception as e:
        logger.debug(f"PostHog: Failed to capture extraction generation: {e}")


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
    ) -> tuple:
        """
        Extract all calendar events from raw input in a single LLM call.

        Args:
            text: Raw text input (or placeholder for images)
            input_type: 'text', 'pdf', 'audio', 'email', 'image', 'document'
            metadata: Optional metadata (image_data + media_type for vision path)

        Returns:
            (ExtractedEventBatch, messages, raw_ai_message) — parsed result,
            the exact LangChain messages sent to the model, and the raw
            AIMessage response (for PostHog observability).
        """
        is_vision = metadata and metadata.get('requires_vision')

        if is_vision:
            return self._execute_vision(text, metadata)
        else:
            return self._execute_text(text, input_type)

    def _execute_text(self, text: str, input_type: str) -> tuple:
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

        t0 = _time.time()
        raw_result = structured_llm.invoke(messages)
        duration_ms = (_time.time() - t0) * 1000

        result = raw_result['parsed']
        raw_ai_message = raw_result.get('raw')

        # Manual PostHog generation capture with full I/O
        _capture_generation('extraction', messages, raw_ai_message, duration_ms)

        if not result or not result.events:
            return ExtractedEventBatch(session_title="Untitled", input_summary="", events=[]), messages, raw_ai_message

        logger.info(f"Extracted {len(result.events)} events from {input_type} input")
        return result, messages, raw_ai_message

    def _execute_vision(self, text: str, metadata: Dict) -> tuple:
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

        t0 = _time.time()
        raw_result = structured_llm.invoke(messages)
        duration_ms = (_time.time() - t0) * 1000

        result = raw_result['parsed']
        raw_ai_message = raw_result.get('raw')

        # Manual PostHog generation capture with full I/O
        _capture_generation('extraction', messages, raw_ai_message, duration_ms)

        if not result or not result.events:
            return ExtractedEventBatch(session_title="Untitled", input_summary="", events=[]), messages, raw_ai_message

        logger.info(f"Extracted {len(result.events)} events from image input")
        return result, messages, raw_ai_message
