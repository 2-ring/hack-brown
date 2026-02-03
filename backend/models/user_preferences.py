"""
User Preferences Models for Personalization - Free-form Pattern Discovery.
Learns emergent patterns from user's calendar history without predefined schemas.
"""

from pydantic import BaseModel, Field
from typing import List, Optional


class DiscoveredPattern(BaseModel):
    """A single discovered pattern with context"""
    pattern: str = Field(
        description="Natural language description of the pattern"
    )
    confidence: str = Field(
        default="medium",
        description="Confidence level: 'high', 'medium', 'low'"
    )
    examples: List[str] = Field(
        default_factory=list,
        description="Example events that demonstrate this pattern"
    )
    frequency: Optional[str] = Field(
        default=None,
        description="How often this pattern appears: 'always', 'usually', 'sometimes'"
    )


class TitleFormattingPatterns(BaseModel):
    """Patterns discovered in event title formatting"""
    patterns: List[DiscoveredPattern] = Field(
        default_factory=list,
        description="Discovered patterns in title formatting"
    )


class DescriptionFormattingPatterns(BaseModel):
    """Patterns discovered in event description formatting"""
    patterns: List[DiscoveredPattern] = Field(
        default_factory=list,
        description="Discovered patterns in description formatting"
    )


class ColorUsagePatterns(BaseModel):
    """Patterns discovered in color usage"""
    patterns: List[DiscoveredPattern] = Field(
        default_factory=list,
        description="Discovered patterns in color selection"
    )


class LocationFormattingPatterns(BaseModel):
    """Patterns discovered in location formatting"""
    patterns: List[DiscoveredPattern] = Field(
        default_factory=list,
        description="Discovered patterns in location formatting"
    )


class DurationPatterns(BaseModel):
    """Patterns discovered in event durations"""
    patterns: List[DiscoveredPattern] = Field(
        default_factory=list,
        description="Discovered patterns in event durations"
    )


class TimingPatterns(BaseModel):
    """Patterns discovered in when events are scheduled"""
    patterns: List[DiscoveredPattern] = Field(
        default_factory=list,
        description="Discovered patterns in event timing"
    )


class CalendarUsagePattern(BaseModel):
    """Pattern for when and why a specific calendar is used"""
    calendar_name: str = Field(description="Name of the calendar")
    calendar_id: str = Field(description="Calendar ID")
    is_primary: bool = Field(default=False, description="Whether this is the primary calendar")
    usage_patterns: List[DiscoveredPattern] = Field(
        default_factory=list,
        description="When and why this calendar is used"
    )
    event_types: List[str] = Field(
        default_factory=list,
        description="Types of events typically on this calendar"
    )
    typical_event_count: Optional[int] = Field(
        default=None,
        description="Typical number of events on this calendar"
    )


class CalendarUsagePatterns(BaseModel):
    """Patterns for how different calendars are used"""
    calendars: List[CalendarUsagePattern] = Field(
        default_factory=list,
        description="Usage patterns for each calendar"
    )


class ContextualPatterns(BaseModel):
    """Context-specific patterns (e.g., 'when event type is X, user does Y')"""
    patterns: List[DiscoveredPattern] = Field(
        default_factory=list,
        description="Contextual patterns discovered"
    )


class UserPreferences(BaseModel):
    """Complete user preferences learned from calendar history - Free-form pattern discovery"""

    user_id: str = Field(description="User identifier")

    last_analyzed: Optional[str] = Field(
        default=None,
        description="ISO timestamp of last analysis"
    )

    total_events_analyzed: int = Field(
        default=0,
        description="Number of events used for analysis"
    )

    analysis_date_range: Optional[dict] = Field(
        default=None,
        description="Date range of analyzed events: {'start': 'ISO date', 'end': 'ISO date'}"
    )

    # User settings from Google Calendar API
    timezone: Optional[str] = Field(
        default=None,
        description="User's default timezone from Google Calendar settings"
    )

    default_event_length: Optional[int] = Field(
        default=None,
        description="User's default event length in minutes from Google Calendar settings"
    )

    # Discovered pattern categories
    title_formatting: TitleFormattingPatterns = Field(
        default_factory=TitleFormattingPatterns,
        description="Patterns in how user formats event titles"
    )

    description_formatting: DescriptionFormattingPatterns = Field(
        default_factory=DescriptionFormattingPatterns,
        description="Patterns in how user formats event descriptions"
    )

    color_usage: ColorUsagePatterns = Field(
        default_factory=ColorUsagePatterns,
        description="Patterns in how user assigns colors to events"
    )

    location_formatting: LocationFormattingPatterns = Field(
        default_factory=LocationFormattingPatterns,
        description="Patterns in how user formats location information"
    )

    duration_patterns: DurationPatterns = Field(
        default_factory=DurationPatterns,
        description="Patterns in typical event durations"
    )

    timing_patterns: TimingPatterns = Field(
        default_factory=TimingPatterns,
        description="Patterns in when events are scheduled"
    )

    calendar_usage: CalendarUsagePatterns = Field(
        default_factory=CalendarUsagePatterns,
        description="Patterns for when and why different calendars are used"
    )

    contextual_patterns: ContextualPatterns = Field(
        default_factory=ContextualPatterns,
        description="Context-specific patterns (e.g., 'when creating X, user does Y')"
    )

    # General observations
    general_observations: List[str] = Field(
        default_factory=list,
        description="General observations about user's calendar habits that don't fit other categories"
    )
