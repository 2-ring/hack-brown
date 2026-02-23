"""
Pydantic models for agent inputs and outputs.
"""

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List, Literal
import re
from datetime import datetime
import pytz


# ============================================================================
# EXTRACT Stage: Lean event extraction model
# ============================================================================

class ExtractedEvent(BaseModel):
    """
    Single calendar event extracted from input.

    Uses natural language date/time strings (resolved by Duckling downstream).
    Intentionally lean — only the fields needed to create a calendar event.
    """
    summary: str = Field(
        description="Event title — clean, descriptive, Title Case. 2-5 words."
    )
    start_date: Optional[str] = Field(
        default=None,
        description="When the event starts, as natural language: 'tomorrow', 'next Tuesday', "
                    "'October 20, 2025'. For recurring events, the first occurrence. "
                    "None if no date mentioned."
    )
    end_date: Optional[str] = Field(
        default=None,
        description="When the event ends, as natural language. Multi-day events: the last day. "
                    "Recurring events: when they stop. None for single-day or open-ended events."
    )
    start_time: Optional[str] = Field(
        default=None,
        description="Start time as stated: '3pm', '3:00 pm', 'noon', '14:00'. "
                    "None for all-day events or when no time mentioned."
    )
    end_time: Optional[str] = Field(
        default=None,
        description="End time ONLY if explicitly stated: '5pm' (from '3-5pm'). "
                    "None if not mentioned — do NOT infer."
    )
    location: Optional[str] = Field(
        default=None,
        description="Physical location: 'Friedman Hall 108', 'Starbucks'. "
                    "Not 'virtual', 'online', 'Zoom' (those go in description)."
    )
    description: Optional[str] = Field(
        default=None,
        description="Additional details beyond the title: preparation, agenda, "
                    "people involved, meeting URLs, notes. None if nothing to add."
    )
    is_all_day: bool = Field(
        default=False,
        description="True for birthdays, holidays, deadlines, trips (no time). "
                    "False for events that likely have a time."
    )
    recurrence: Optional[List[str]] = Field(
        default=None,
        description="RRULE pattern strings WITHOUT UNTIL: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE']. "
                    "Use end_date for the recurrence end, not UNTIL in the RRULE. "
                    "None for one-time events."
    )
    excluded_dates: Optional[List[str]] = Field(
        default=None,
        description="Dates when a recurring event does NOT occur (holidays, breaks, cancellations). "
                    "Each entry must be a single date: ['March 23, 2026', 'March 25, 2026']. "
                    "For date ranges, list each date individually. "
                    "None for one-time events or if no exclusions."
    )

    @field_validator('summary')
    @classmethod
    def validate_summary(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Summary cannot be empty")
        v = v.strip()
        if len(v) > 200:
            v = v[:197] + "..."
        return v


class ExtractedEventBatch(BaseModel):
    """Batch output — one ExtractedEvent per real-world event found in input."""
    session_title: str = Field(
        description="Short ~3 word descriptive title for this session (e.g. '[MATH180] Syllabus', 'Weekend Chores', 'Dinner with Ben')"
    )
    input_summary: str = Field(
        description="1-2 sentence summary of what the user provided and what it contains. "
                    "Describe the source type, subject matter, and the kinds of events found. "
                    "Examples: 'The user provided a PDF syllabus for ENGN 0520 Electrical Circuits and Systems. "
                    "It contains lectures, exams, homework deadlines, and lab due dates.' or "
                    "'The user provided a Google Flights booking confirmation for a round trip flight "
                    "from Boston to San Juan on January 28th.' or "
                    "'The user described a dinner plan with Jack at The Ratty tomorrow evening.'"
    )
    events: List[ExtractedEvent] = Field(
        description="One ExtractedEvent per real-world event. Deduplicated."
    )


# ============================================================================
# Pipeline Standard Model
# ============================================================================

class CalendarDateTime(BaseModel):
    """Date/time supporting both timed events and all-day events"""
    dateTime: Optional[str] = Field(default=None, description="ISO 8601 datetime with timezone for timed events: '2026-02-01T14:00:00-05:00'")
    date: Optional[str] = Field(default=None, description="YYYY-MM-DD date for all-day events: '2026-02-05'")
    timeZone: Optional[str] = Field(default=None, description="IANA timezone: 'America/New_York'")

    @model_validator(mode='after')
    def validate_has_date_or_datetime(self):
        """Ensure either dateTime or date is provided, not both"""
        if self.dateTime and self.date:
            raise ValueError("Provide either dateTime (timed event) or date (all-day event), not both")
        if not self.dateTime and not self.date:
            raise ValueError("Must provide either dateTime or date")
        return self

    @field_validator('dateTime')
    @classmethod
    def validate_datetime(cls, v: Optional[str]) -> Optional[str]:
        """Validate ISO 8601 datetime format with timezone"""
        if v is None:
            return v

        if not isinstance(v, str):
            raise ValueError("dateTime must be a string")

        iso_pattern = r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$'
        if not re.match(iso_pattern, v):
            raise ValueError(
                f"dateTime must be ISO 8601 format with timezone "
                f"(e.g., '2026-02-05T14:00:00-05:00'), got '{v}'"
            )

        try:
            date_time_part = v[:19]
            datetime.strptime(date_time_part, '%Y-%m-%dT%H:%M:%S')
        except ValueError as e:
            raise ValueError(f"Invalid ISO 8601 datetime '{v}': {str(e)}")

        return v

    @field_validator('date')
    @classmethod
    def validate_date(cls, v: Optional[str]) -> Optional[str]:
        """Validate YYYY-MM-DD date format for all-day events"""
        if v is None:
            return v

        if not isinstance(v, str):
            raise ValueError("date must be a string")

        date_pattern = r'^\d{4}-\d{2}-\d{2}$'
        if not re.match(date_pattern, v):
            raise ValueError(f"date must be YYYY-MM-DD format, got '{v}'")

        try:
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError as e:
            raise ValueError(f"Invalid date '{v}': {str(e)}")

        return v

    @field_validator('timeZone')
    @classmethod
    def validate_timezone(cls, v: Optional[str]) -> Optional[str]:
        """Validate IANA timezone string"""
        if v is None:
            return v

        if not isinstance(v, str):
            raise ValueError("timeZone must be a string")

        try:
            pytz.timezone(v)
        except pytz.exceptions.UnknownTimeZoneError:
            raise ValueError(
                f"Invalid IANA timezone '{v}'. "
                f"Examples: America/New_York, America/Chicago, UTC, Europe/London"
            )

        return v


class CalendarEvent(BaseModel):
    """
    Unified calendar event model — the standard output for the extraction pipeline.

    Produced by RESOLVE, optionally enhanced by PERSONALIZE, consumed by MODIFY
    and the calendar write layer.
    """
    summary: str = Field(description="Event title — clean, descriptive, and scannable")
    start: CalendarDateTime = Field(description="Start date/time")
    end: Optional[CalendarDateTime] = Field(default=None, description="End date/time. None when not explicitly stated (PERSONALIZE infers later).")
    location: Optional[str] = Field(default=None, description="Physical location (standardized)")
    description: Optional[str] = Field(default=None, description="Event description/notes")
    recurrence: Optional[List[str]] = Field(default=None, description="RRULE strings for recurring events")

    # Set by EXTRACT (if explicit) or PERSONALIZE stage
    calendar: Optional[str] = Field(default=None, description="Target calendar ID (provider calendar ID). None = primary calendar.")

    @field_validator('summary')
    @classmethod
    def validate_summary(cls, v: str) -> str:
        """Validate and truncate summary"""
        from config.limits import TextLimits
        max_len = TextLimits.EVENT_TITLE_MAX_LENGTH

        if not v or not v.strip():
            raise ValueError("Summary cannot be empty")

        v = v.strip()
        if len(v) > max_len:
            v = v[:max_len - 3] + "..."

        return v

    @field_validator('recurrence')
    @classmethod
    def validate_recurrence(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        """Validate iCalendar recurrence properties (RRULE, EXDATE, RDATE)."""
        if v is None:
            return v

        if not isinstance(v, list):
            raise ValueError("Recurrence must be a list of iCalendar recurrence strings")

        for rule in v:
            if not isinstance(rule, str):
                raise ValueError(f"Each entry must be a string, got {type(rule).__name__}")

            if rule.startswith('RRULE:'):
                rrule_content = rule[6:]

                if 'FREQ=' not in rrule_content:
                    raise ValueError(f"RRULE must contain FREQ parameter, got '{rule}'")

                valid_freq = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']
                freq_match = re.search(r'FREQ=(\w+)', rrule_content)
                if freq_match and freq_match.group(1) not in valid_freq:
                    raise ValueError(f"Invalid FREQ value '{freq_match.group(1)}', must be one of {valid_freq}")

                if 'BYDAY=' in rrule_content:
                    valid_days = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
                    byday_match = re.search(r'BYDAY=([A-Z,]+)', rrule_content)
                    if byday_match:
                        for day in byday_match.group(1).split(','):
                            day_code = re.sub(r'^\d+', '', day)
                            if day_code not in valid_days:
                                raise ValueError(f"Invalid BYDAY code '{day}', must be one of {valid_days}")

            elif rule.startswith('EXDATE'):
                # EXDATE entries: EXDATE;TZID=America/New_York:20260323T100000
                # or EXDATE;VALUE=DATE:20260323
                if ':' not in rule:
                    raise ValueError(f"EXDATE must contain a colon separator, got '{rule}'")

            elif rule.startswith(('RDATE', 'EXRULE:')):
                pass  # Accept other iCalendar recurrence properties

            else:
                raise ValueError(
                    f"Recurrence entry must start with RRULE:, EXDATE, RDATE, or EXRULE:, got '{rule}'"
                )

        return v


# ============================================================================
# MODIFY: Event Modification
# ============================================================================

class EventAction(BaseModel):
    """A single modification action targeting one event by index."""
    index: int = Field(description="0-based index of the event in the input list")
    action: Literal["edit", "delete"] = Field(
        description="'edit' to modify the event (edited_event required), 'delete' to remove it"
    )
    edited_event: Optional['CalendarEvent'] = Field(
        default=None,
        description="The full modified CalendarEvent. Required when action='edit', omit for 'delete'."
    )


class ModificationResult(BaseModel):
    """Result of the multi-event modification."""
    actions: List[EventAction] = Field(
        default_factory=list,
        description="List of modifications. Only include events that should change. Events not listed are kept as-is."
    )
    message: Optional[str] = Field(
        default=None,
        description="Short natural-language response to show the user (e.g. 'Moved your Thursday meeting to 3pm')."
    )
