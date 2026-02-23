"""
Base Agent Interface for DropCal Pipeline
"""

from abc import ABC, abstractmethod
from typing import Any


class BaseAgent(ABC):
    """
    Abstract base class for all agents in the pipeline.
    Each agent has a single responsibility and clean I/O interface.

    Prompts are loaded via core.prompt_loader.load_prompt() which handles
    Jinja2 templating. See core/prompt_loader.py for usage.
    """

    def __init__(self, name: str):
        self.name = name

    @abstractmethod
    def execute(self, *args, **kwargs) -> Any:
        """
        Execute the agent's main logic.
        Each agent implements its specific processing.

        Returns:
            Agent-specific output (usually a Pydantic model)
        """
        pass
