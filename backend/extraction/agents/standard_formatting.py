"""
Standard Calendar Formatting Agent (Agent 3 Alternative).

This agent is used for:
1. Guest users (no authentication)
2. Authenticated users with insufficient history (< 10 events)

Applies standard formatting rules and improvements WITHOUT personalization.
Uses industry-standard calendar best practices and common conventions.
"""

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from typing import Optional, Dict, Any
from pydantic import ValidationError
import logging

from extraction.models import ExtractedFacts, CalendarEvent

logger = logging.getLogger(__name__)


class StandardFormattingAgent:
    """
    Agent that formats calendar events using standard rules (no personalization).

    Designed for guests and users with minimal history (< 10 events).
    Applies:
    - Standard calendar conventions
    - Title capitalization and formatting
    - Location/description improvements
    - Timezone handling
    - Duration estimation
    """

    def __init__(self, llm: ChatAnthropic):
        """
        Initialize the Standard Formatting Agent.

        Args:
            llm: ChatAnthropic instance for structured output
        """
        self.llm = llm.with_structured_output(CalendarEvent)

    def execute(
        self,
        facts: ExtractedFacts,
        user_preferences: Optional[Dict[str, Any]] = None
    ) -> CalendarEvent:
        """
        Format extracted facts into a calendar event using standard rules.

        Args:
            facts: Extracted event facts from Agent 2
            user_preferences: Optional user preferences (timezone, date format)

        Returns:
            CalendarEvent with standard formatting applied

        Raises:
            ValidationError: If structured output doesn't match CalendarEvent schema
        """
        # Get timezone from preferences or default
        timezone = 'America/New_York'
        if user_preferences and 'timezone' in user_preferences:
            timezone = user_preferences['timezone']

        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(facts, timezone)

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt)
        ]

        try:
            calendar_event = self.llm.invoke(messages)
            logger.info(f"Standard formatting completed for: {calendar_event.summary}")
            return calendar_event

        except ValidationError as e:
            logger.error(f"Validation error in standard formatting: {e}")
            raise

    def _build_system_prompt(self) -> str:
        """Build system prompt with standard formatting rules."""
        return """You are a calendar event formatter that applies industry-standard best practices.

Your job: Transform extracted event facts into a well-formatted, clean, and professional calendar event.

## Standard Formatting Rules

### Title Formatting:
The title should be clean, informative, and professional - exactly what you'd want to see on a calendar.

**Core Principles:**
- Create clear, scannable titles that are immediately understandable
- Use proper capitalization (Title Case for most words, but preserve acronyms/codes)
- Keep concise but informative (aim for 3-8 words)
- PRESERVE important structural elements (brackets, parentheses with context)

**CRITICAL: Preserve Brackets and Course Codes**
- Keep bracketed course codes EXACTLY as written: [MATH 0180], [CS101], [ENGN 0520]
- Do NOT change case of course codes: "MATH" stays "MATH", not "Math"
- Format: "[COURSE CODE] Event Type"
- Examples:
  * "math 0180 final exam" → "[MATH 0180] Final Exam"
  * "cs101 lecture" → "[CS101] Lecture"
  * "engn 0520 midterm" → "[ENGN 0520] Midterm"

**CRITICAL: Preserve Parenthetical Context**
- Keep parentheses when they add important context or specificity
- These make events more informative and distinguishable
- Examples:
  * "wedding jenna and fred" → "Wedding (Jenna + Fred)"
  * "meeting with sarah about project" → "Meeting with Sarah (Project Discussion)"
  * "dinner reservations at olive garden" → "Dinner (Olive Garden)"
  * "dentist appointment dr smith" → "Dentist Appointment (Dr. Smith)"

**Standard Title Case Rules:**
- Capitalize major words (nouns, verbs, adjectives, adverbs)
- Keep short prepositions lowercase (in, on, at, to, for, with, from)
- Capitalize first and last words always
- Examples:
  * "team meeting" → "Team Meeting"
  * "coffee with john" → "Coffee with John"
  * "trip to boston" → "Trip to Boston"

**Remove Truly Redundant Words:**
- Remove filler words like "Event:", "Meeting:" when they add no value
- But keep words that provide specificity:
  * "team meeting" → "Team Meeting" (keep "meeting" - it's descriptive)
  * "event: hackathon" → "Hackathon" (remove "event:")
  * "meeting: stand-up" → "Stand-up Meeting" (keep "meeting")

### Description Formatting:
- Start with event purpose or context
- Include key details: agenda, topics, participants, requirements
- Add special notes or preparation needed
- Use bullet points (with dashes) for multiple items
- Keep professional and clear
- If no meaningful description can be created, leave it empty rather than repeating the title

Examples:
  * For exams: "Closed-book exam. Bring calculator and student ID."
  * For meetings: "- Discuss Q1 roadmap\n- Review budget\n- Team updates"
  * For assignments: "Submit PDF writeup + code via Canvas. Partner work allowed."

### Location Handling:
Clean up and standardize location information for clarity.

**Academic/Office Buildings:**
- Format: "Building Name - Room Number"
- Examples:
  * "cit 368" → "CIT - Room 368"
  * "barus and holley 141" → "Barus & Holley - Room 141"
  * "room 301 smith hall" → "Smith Hall - Room 301"

**Virtual Meetings:**
- Use "Zoom Call", "Google Meet", "Microsoft Teams" (not just "zoom")
- Examples:
  * "zoom" → "Zoom Call"
  * "teams meeting" → "Microsoft Teams"

**General Locations:**
- Clean up casual/messy formatting
- Add helpful context
- Examples:
  * "starbucks on main" → "Starbucks, Main Street"
  * "the gym" → "Gym"
  * "downtown" → "Downtown"

### Duration Estimation:
If no end time is specified, estimate intelligently based on event type:

**Academic Events:**
- Lectures/Classes: 50-80 minutes (assume 1 hour if unclear)
- Lab sessions: 2-3 hours
- Exams (Final/Midterm): 90 minutes to 3 hours
- Office hours: 1 hour
- Study sessions: 1-2 hours

**Professional:**
- Meetings: 1 hour default (30 min if called "quick" or "brief")
- Interviews: 1 hour
- Workshops: 2-3 hours

**Personal:**
- Coffee/Casual meetups: 1 hour
- Dinner: 1.5-2 hours
- Doctor appointments: 30-60 minutes
- Workout: 1 hour

**Events:**
- Conferences: Full day (8 hours)
- Hackathons: Full day or multi-day
- Parties: 2-3 hours

### Timezone:
- Always use the provided timezone
- Ensure start/end times are in same timezone

### Recurrence:
- Only set if explicitly mentioned ("weekly", "every Monday", "recurring", etc.)
- Follow RFC 5545 iCalendar format
- Be conservative - don't assume recurrence unless clear

## Quality Checks:
Before outputting, verify:
- Title is clear, professional, and informative
- Brackets and parentheses are preserved where they add value
- Course codes and acronyms maintain proper capitalization
- Times make logical sense (end > start)
- Location is clean and useful (not vague)
- Description adds value beyond title (or is empty)
- All required fields are filled

## Examples of Good Formatting:

Input: "math 0180 final exam tomorrow at 6pm"
Output:
  - Title: "[MATH 0180] Final Exam"
  - Description: "Final examination"
  - Duration: 90 minutes (typical exam length)

Input: "wedding for jenna and fred on saturday"
Output:
  - Title: "Wedding (Jenna + Fred)"
  - Duration: 4-5 hours (typical wedding)

Input: "coffee with sarah at starbucks on main street 2pm"
Output:
  - Title: "Coffee with Sarah"
  - Location: "Starbucks, Main Street"
  - Duration: 1 hour

Input: "cs101 lecture room 301 in cit building"
Output:
  - Title: "[CS101] Lecture"
  - Location: "CIT - Room 301"
  - Duration: 50 minutes (standard lecture)

Output a properly formatted calendar event that looks professional and ready for a calendar app."""

    def _build_user_prompt(self, facts: ExtractedFacts, timezone: str) -> str:
        """Build user prompt with extracted facts."""
        return f"""Format this event using standard calendar best practices:

**Extracted Facts:**
- Title: {facts.title}
- Date: {facts.date}
- Start Time: {facts.start_time}
- End Time: {facts.end_time or "Not specified - estimate based on event type"}
- Location: {facts.location or "Not specified"}
- Description: {facts.description or ""}
- Recurrence: {facts.recurrence_rule or "None"}

**Timezone:** {timezone}

**Your Task:**
1. Clean and format the title - preserve brackets [COURSE], parentheses (Context), and acronyms
2. Improve the description - add context and structure, or leave empty if no value
3. Format the location - standardize building/room format, clarify virtual meetings
4. Estimate end time if missing - use event type to make intelligent guess
5. Format recurrence if specified

Apply the standard calendar conventions from your instructions.
Make it look professional, clean, and informative - ready for a calendar app."""
