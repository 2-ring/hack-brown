"""
DropCal Agent Pipeline - Multi-Agent Event Extraction System

Organized by functionality:
- extraction/: Main extraction pipeline (Agents 0-3)
- modification: Event editing (Agent 4)
- preferences: Personalization (Agent 5)
"""

from .extraction import (
    ContextUnderstandingAgent,
    EventIdentificationAgent,
    FactExtractionAgent,
    CalendarFormattingAgent
)
from .modification import EventModificationAgent
from .preferences import PreferenceApplicationAgent

__all__ = [
    # Core pipeline agents
    "ContextUnderstandingAgent",
    "EventIdentificationAgent",
    "FactExtractionAgent",
    "CalendarFormattingAgent",

    # Specialized agents
    "EventModificationAgent",
    "PreferenceApplicationAgent",
]
