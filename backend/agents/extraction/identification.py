"""
Event Identification Agent (Agent 1)
Identifies distinct calendar events in the input.
"""

from typing import Dict, Any, Optional
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from ..base import BaseAgent
from models.agent_models import IdentificationResult
from logging_utils import log_agent_execution


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
        self.prompt_template = self.load_prompt("identification.txt")

    @log_agent_execution("Agent1_EventIdentification")
    def execute(
        self,
        raw_input: str,
        metadata: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
        requires_vision: bool = False
    ) -> IdentificationResult:
        """
        Identify all calendar events in the input.

        Args:
            raw_input: Raw text input
            metadata: Additional metadata (may contain image data)
            context: Optional context from Agent 0 for guidance
            requires_vision: Whether vision processing is needed

        Returns:
            IdentificationResult with list of identified events
        """
        # Build context guidance if available
        context_guidance = self._build_context_guidance(context)

        # Format the system prompt with context guidance
        system_prompt = self.prompt_template.format(context_guidance=context_guidance)

        if requires_vision:
            return self._execute_vision(metadata, system_prompt)
        else:
            return self._execute_text(raw_input, system_prompt)

    def _build_context_guidance(self, context: Optional[Dict[str, Any]]) -> str:
        """Build context guidance string from Agent 0's output"""
        if not context:
            return ""

        intent = context.get('intent_analysis', {})
        guidance = intent.get('extraction_guidance', {})
        include = guidance.get('include', [])
        exclude = guidance.get('exclude', [])
        reasoning = guidance.get('reasoning', '')

        if not (include or exclude):
            return ""

        context_guidance = f"""

CONTEXT UNDERSTANDING:
The input has been analyzed and the following guidance should inform your extraction:

PRIMARY USER GOAL: {intent.get('primary_goal', 'Not specified')}

EXTRACTION GUIDANCE:
- INCLUDE these types of events: {', '.join(include) if include else 'All calendar events'}
- EXCLUDE these types of content: {', '.join(exclude) if exclude else 'Standard non-event content'}
- REASONING: {reasoning}

Use this guidance to make smart decisions about what is and isn't a calendar event the user wants.
"""
        return context_guidance

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
