"""
Pydantic models for agent inputs and outputs.
Extracted from app.py for better organization.
"""

from pydantic import BaseModel, Field
from typing import Optional, List


# ============================================================================
# Agent 0: Context Understanding & Intent Analysis
# ============================================================================

class UserContext(BaseModel):
    """User's role and context"""
    role: str = Field(description="User's likely role: 'student', 'professional', 'organizer', 'attendee', etc.")
    domain: str = Field(description="Domain/context: 'academic', 'professional', 'personal', 'social', etc.")
    task_type: str = Field(description="Type of task: 'semester_planning', 'single_event', 'coordinating_meeting', 'conference_attendance', 'importing_schedule', etc.")


class ExtractionGuidance(BaseModel):
    """Guidance for the extraction agent"""
    include: List[str] = Field(description="Types of events TO extract: ['assignments', 'exams', 'meetings', 'deadlines', etc.]")
    exclude: List[str] = Field(description="Types of content to IGNORE: ['readings', 'office_hours', 'course_description', 'grading_policy', etc.]")
    reasoning: str = Field(description="Why these inclusion/exclusion decisions make sense given user intent")


class IntentAnalysis(BaseModel):
    """Analysis of user's intent and goals"""
    primary_goal: str = Field(description="What the user wants to accomplish: 'Schedule all assignment deadlines', 'Add this single event', 'Import team meeting schedule', etc.")
    confidence: str = Field(description="Confidence in intent understanding: 'high', 'medium', 'low'")
    extraction_guidance: ExtractionGuidance = Field(description="Specific guidance for extraction agent")
    expected_event_count: str = Field(description="Estimated number of events: 'single event', '5-10 events', '15-20 events', etc.")
    domain_assumptions: str = Field(description="Key assumptions about this domain: 'Academic calendar, assignments are non-negotiable dates', 'Professional context, tentative meetings need confirmation', etc.")


class ContextResult(BaseModel):
    """Complete context understanding output"""
    title: str = Field(description="Short session title (3 words max, aim for 2). Just the essential name, no dates or descriptions. Examples: 'CS101 Deadlines', 'AI Safety Talk', 'Team Schedule', 'Shabbat Dinner', 'MATH180 Exams'")
    user_context: UserContext = Field(description="User's role and context")
    intent_analysis: IntentAnalysis = Field(description="Deep analysis of user intent and goals")


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
    """Semantic facts extracted from event text"""
    title: str = Field(description="Event title/name extracted from the text")
    date: Optional[str] = Field(default=None, description="Date as written: 'tomorrow', 'Feb 25', 'Friday', 'next week', etc. Do NOT normalize.")
    time: Optional[str] = Field(default=None, description="Start time as written: '2pm', '14:00', '6:30pm', 'afternoon', etc. Do NOT normalize.")
    end_time: Optional[str] = Field(default=None, description="End time if explicitly mentioned: '3pm', '15:00', etc.")
    duration: Optional[str] = Field(default=None, description="Duration if mentioned: '90 minutes', '2 hours', '30 min', etc.")
    location: Optional[str] = Field(default=None, description="Location/venue: 'Conference Room B', 'Zoom', 'Olive Garden', etc.")
    notes: Optional[str] = Field(default=None, description="Additional notes or context: 'bring laptop', 'closed-book', etc.")
    people: Optional[List[str]] = Field(default=None, description="People mentioned: ['Sarah', 'John'], etc.")
    recurrence: RecurrenceInfo = Field(description="Recurrence pattern information")
    calendar: Optional[str] = Field(
        default=None,
        description="Calendar name where this event should be created. Examples: 'Classes', 'Work', 'UAPPLY', 'Default'. If None, will use primary calendar. Based on learned calendar usage patterns."
    )


# ============================================================================
# Agent 3: Calendar Formatting
# ============================================================================

class CalendarDateTime(BaseModel):
    """Date/time in calendar format"""
    dateTime: str = Field(description="ISO 8601 datetime with timezone: '2026-02-01T14:00:00-05:00'")
    timeZone: str = Field(description="IANA timezone: 'America/New_York'")


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
