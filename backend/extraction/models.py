"""
Pydantic models for agent inputs and outputs.
Extracted from app.py for better organization.
"""

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List
import re
from datetime import datetime
import pytz


# ============================================================================
# Agent 1: Event Identification
# ============================================================================

class IdentifiedEvent(BaseModel):
    """A single identified event with raw text and description"""
    raw_text: List[str] = Field(
        description="List of complete text chunks relevant to this event. Keep sentences/phrases intact. Can include multiple chunks if event info is spread across text. Chunks can repeat across events if shared context. Example: ['Team meeting tomorrow at 2pm in Conference Room B.', 'Bring the report.'] or ['Homework due Tuesdays at 9pm ET']"
    )
    description: str = Field(
        description="Uniquely identifying description using ONLY explicit facts from raw_text. Must distinguish this event from others. Examples: 'Team meeting with Sarah (tomorrow 2pm, Conference Room B)' or 'MATH 0180 first midterm exam (90 minutes, February 25, 6:30pm)' or 'Weekly homework deadline for ENGN 0520 (Tuesdays 9pm ET)'. NOT just 'Meeting' or 'Exam' - be specific and comprehensive."
    )
    confidence: str = Field(
        description="'definite' if certain this will happen, 'tentative' if uncertain (contains words like: maybe, possibly, might, perhaps, etc.)"
    )


class IdentificationResult(BaseModel):
    """Result of event identification"""
    events: List[IdentifiedEvent] = Field(
        description="Every calendar event identified in the input. Count carefully - missing events is the biggest risk!"
    )
    num_events: int = Field(
        description="Total count of events found. Must match length of events list."
    )
    has_events: bool = Field(
        description="True if any events were found, False if no events at all"
    )


# ============================================================================
# Agent 2: Semantic Fact Extraction
# ============================================================================

class RecurrenceInfo(BaseModel):
    """Recurrence pattern information"""
    is_recurring: bool = Field(description="True if this event repeats")
    pattern: Optional[str] = Field(default=None, description="Recurrence pattern: 'daily', 'weekly', 'monthly', 'yearly'")
    days: Optional[List[str]] = Field(default=None, description="Days of week for recurring events: ['Monday', 'Wednesday']")
    frequency: Optional[str] = Field(default=None, description="Frequency modifier: 'every', 'every other', 'twice'")


class ExtractedFacts(BaseModel):
    """Semantic facts extracted and normalized from event text"""
    title: str = Field(description="Event title/name extracted from the text")
    date: Optional[str] = Field(default=None, description="Normalized date in YYYY-MM-DD format: '2026-02-05', '2026-12-25', etc.")
    time: Optional[str] = Field(default=None, description="Normalized start time in HH:MM:SS 24-hour format: '14:00:00', '09:30:00', etc.")
    end_time: Optional[str] = Field(default=None, description="Normalized end time in HH:MM:SS 24-hour format if explicitly mentioned")
    duration: Optional[str] = Field(default=None, description="Duration if mentioned: '90 minutes', '2 hours', '30 min', etc.")
    location: Optional[str] = Field(default=None, description="PHYSICAL location only: 'Conference Room B', 'Starbucks', 'Puerto Rico', 'Smith Hall 201'. NOT virtual meeting links.")
    meeting_url: Optional[str] = Field(default=None, description="Virtual meeting link: 'https://zoom.us/j/123...', 'https://teams.microsoft.com/...'. Full URL for online meetings.")
    notes: Optional[str] = Field(default=None, description="Additional notes or context: 'bring laptop', 'closed-book', etc.")
    people: Optional[List[str]] = Field(default=None, description="People mentioned by name: ['Sarah', 'John'], etc.")
    attendees: Optional[List[str]] = Field(default=None, description="Email addresses to invite: ['sarah@example.com', 'john@company.com']. Only if explicitly mentioned.")
    instructions: Optional[str] = Field(default=None, description="User's explicit requests/instructions: 'invite Sarah', 'remind me 1 hour before', 'high priority', 'add to work calendar'")
    recurrence: RecurrenceInfo = Field(description="Recurrence pattern information")
    calendar: Optional[str] = Field(
        default=None,
        description="Calendar name where this event should be created. Examples: 'Classes', 'Work', 'UAPPLY', 'Default'. If None, will use primary calendar. Based on learned calendar usage patterns."
    )

    @field_validator('title')
    @classmethod
    def validate_title(cls, v: str) -> str:
        """
        Validate title length and truncate if necessary.
        Hard limit: 100 characters (for consistency with Google Calendar)
        Soft warning: >8 words (logged in pipeline but not blocked here)
        """
        if not v or not v.strip():
            raise ValueError("Title cannot be empty")

        v = v.strip()

        # Hard limit: 100 characters - truncate if exceeded
        if len(v) > 100:
            v = v[:97] + "..."

        return v

    @field_validator('date')
    @classmethod
    def validate_date(cls, v: Optional[str]) -> Optional[str]:
        """
        Validate date is in YYYY-MM-DD format.
        Allows None for optional field.
        """
        if v is None:
            return v

        if not isinstance(v, str):
            raise ValueError(f"Date must be a string, got {type(v).__name__}")

        # Regex for YYYY-MM-DD
        date_pattern = r'^\d{4}-\d{2}-\d{2}$'
        if not re.match(date_pattern, v):
            raise ValueError(
                f"Date must be in YYYY-MM-DD format (e.g., '2026-02-05'), got '{v}'"
            )

        # Validate it's a real date
        try:
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError as e:
            raise ValueError(f"Invalid date '{v}': {str(e)}")

        return v

    @field_validator('time', 'end_time')
    @classmethod
    def validate_time(cls, v: Optional[str]) -> Optional[str]:
        """
        Validate time is in HH:MM:SS 24-hour format.
        Allows None for optional fields.
        """
        if v is None:
            return v

        if not isinstance(v, str):
            raise ValueError(f"Time must be a string, got {type(v).__name__}")

        # Regex for HH:MM:SS (24-hour)
        time_pattern = r'^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$'
        if not re.match(time_pattern, v):
            raise ValueError(
                f"Time must be in HH:MM:SS 24-hour format (e.g., '14:00:00', '09:30:00'), got '{v}'"
            )

        return v


# ============================================================================
# Agent 3: Calendar Formatting
# ============================================================================

class CalendarDateTime(BaseModel):
    """Date/time in calendar format"""
    dateTime: str = Field(description="ISO 8601 datetime with timezone: '2026-02-01T14:00:00-05:00'")
    timeZone: str = Field(description="IANA timezone: 'America/New_York'")

    @field_validator('dateTime')
    @classmethod
    def validate_datetime(cls, v: str) -> str:
        """
        Validate ISO 8601 datetime format with timezone.
        Expected format: 2026-02-05T14:00:00-05:00 or 2026-02-05T14:00:00Z
        """
        if not v or not isinstance(v, str):
            raise ValueError("dateTime must be a non-empty string")

        # ISO 8601 pattern with timezone offset or Z
        # Matches: YYYY-MM-DDTHH:MM:SS±HH:MM or YYYY-MM-DDTHH:MM:SSZ
        iso_pattern = r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$'

        if not re.match(iso_pattern, v):
            raise ValueError(
                f"dateTime must be ISO 8601 format with timezone "
                f"(e.g., '2026-02-05T14:00:00-05:00' or '2026-02-05T14:00:00Z'), got '{v}'"
            )

        # Validate it parses to a real datetime
        try:
            # Use basic parsing for validation (dateutil will be added later)
            # For now, just check the format is correct
            if v.endswith('Z'):
                datetime.strptime(v[:-1], '%Y-%m-%dT%H:%M:%S')
            else:
                # Check date and time parts are valid
                date_time_part = v[:19]  # YYYY-MM-DDTHH:MM:SS
                datetime.strptime(date_time_part, '%Y-%m-%dT%H:%M:%S')
        except ValueError as e:
            raise ValueError(f"Invalid ISO 8601 datetime '{v}': {str(e)}")

        return v

    @field_validator('timeZone')
    @classmethod
    def validate_timezone(cls, v: str) -> str:
        """
        Validate IANA timezone string.
        Examples: 'America/New_York', 'Europe/London', 'UTC'
        """
        if not v or not isinstance(v, str):
            raise ValueError("timeZone must be a non-empty string")

        # Check if timezone exists in pytz
        try:
            pytz.timezone(v)
        except pytz.exceptions.UnknownTimeZoneError:
            # Provide helpful error with common timezones
            common_timezones = [
                'America/New_York', 'America/Chicago', 'America/Denver',
                'America/Los_Angeles', 'UTC', 'Europe/London'
            ]
            raise ValueError(
                f"Invalid IANA timezone '{v}'. "
                f"Examples: {', '.join(common_timezones[:4])}..."
            )

        return v


class CalendarRecurrence(BaseModel):
    """Recurrence rule in RRULE format"""
    rrule: str = Field(description="RRULE string: 'RRULE:FREQ=WEEKLY;BYDAY=TU' or 'RRULE:FREQ=DAILY'")


class CalendarEvent(BaseModel):
    """Formatted calendar event ready for Google Calendar API"""
    summary: str = Field(description="Event title/name")
    start: CalendarDateTime = Field(description="Start date/time")
    end: CalendarDateTime = Field(description="End date/time")
    location: Optional[str] = Field(default=None, description="Event location")
    description: Optional[str] = Field(default=None, description="Event description/notes")
    recurrence: Optional[List[str]] = Field(default=None, description="List of RRULE strings for recurring events")
    attendees: Optional[List[str]] = Field(default=None, description="List of attendee email addresses or names")

    @field_validator('summary')
    @classmethod
    def validate_summary(cls, v: str) -> str:
        """
        Validate summary (title) length.
        Hard limit: 100 characters for consistency
        """
        if not v or not v.strip():
            raise ValueError("Summary cannot be empty")

        v = v.strip()

        # Hard limit: 100 characters - truncate if exceeded
        if len(v) > 100:
            v = v[:97] + "..."

        return v

    @field_validator('recurrence')
    @classmethod
    def validate_recurrence(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        """
        Validate RRULE format for recurrence rules.
        Expected format: ['RRULE:FREQ=WEEKLY;BYDAY=TU', ...]
        Basic validation: checks prefix, FREQ parameter, and BYDAY codes
        """
        if v is None:
            return v

        if not isinstance(v, list):
            raise ValueError("Recurrence must be a list of RRULE strings")

        for rule in v:
            if not isinstance(rule, str):
                raise ValueError(f"Each RRULE must be a string, got {type(rule).__name__}")

            if not rule.startswith('RRULE:'):
                raise ValueError(
                    f"RRULE must start with 'RRULE:', got '{rule}'"
                )

            # Basic validation of RRULE format
            rrule_content = rule[6:]  # Remove 'RRULE:' prefix

            # Must have FREQ
            if 'FREQ=' not in rrule_content:
                raise ValueError(
                    f"RRULE must contain FREQ parameter, got '{rule}'"
                )

            # Validate FREQ values
            valid_freq = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']
            freq_match = re.search(r'FREQ=(\w+)', rrule_content)
            if freq_match:
                freq_value = freq_match.group(1)
                if freq_value not in valid_freq:
                    raise ValueError(
                        f"Invalid FREQ value '{freq_value}', must be one of {valid_freq}"
                    )

            # If BYDAY is present, validate day codes
            if 'BYDAY=' in rrule_content:
                valid_days = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
                byday_match = re.search(r'BYDAY=([A-Z,]+)', rrule_content)
                if byday_match:
                    days = byday_match.group(1).split(',')
                    for day in days:
                        # Remove any numeric prefix (e.g., "2TU" -> "TU")
                        day_code = re.sub(r'^\d+', '', day)
                        if day_code not in valid_days:
                            raise ValueError(
                                f"Invalid BYDAY code '{day}', day code must be one of {valid_days}"
                            )

        return v
