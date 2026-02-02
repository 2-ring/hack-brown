"""
Pattern Analysis Service for discovering user preferences from calendar history.
Uses LLM-based agents to analyze events and extract patterns.
"""

import json
from typing import List, Dict, Optional
from collections import defaultdict
from datetime import datetime

from pydantic import BaseModel
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from user_preferences import (
    UserPreferences,
    TitleFormattingPatterns,
    DescriptionFormattingPatterns,
    ColorUsagePatterns,
    LocationFormattingPatterns,
    DurationPatterns,
    TimingPatterns,
    CalendarUsagePatterns,
    CalendarUsagePattern,
    ContextualPatterns,
    DiscoveredPattern
)
from logging_utils import app_logger


class PatternAnalysisService:
    """
    Service for discovering user preferences from calendar history.
    Uses LLM-based agents to analyze events and extract patterns.
    """

    def __init__(self, llm: ChatAnthropic):
        """
        Initialize pattern analysis service.

        Args:
            llm: LangChain LLM instance (Claude Sonnet 4)
        """
        self.llm = llm
        self.logger = app_logger

    def analyze_comprehensive_data(
        self,
        comprehensive_data: Dict,
        user_id: str = "default"
    ) -> UserPreferences:
        """
        Main entry point: Analyze collected data and discover patterns.

        Args:
            comprehensive_data: Dict with keys:
                - events: List[Dict] (all events from last year)
                - settings: Dict (timezone, default_event_length)
                - colors: Dict (color definitions)
                - calendars: List[Dict] (calendar metadata)
            user_id: User identifier

        Returns:
            UserPreferences object with all discovered patterns
        """
        self.logger.info("=" * 60)
        self.logger.info("PATTERN ANALYSIS STARTED")
        self.logger.info("=" * 60)

        events = comprehensive_data.get('events', [])
        settings = comprehensive_data.get('settings', {})
        colors = comprehensive_data.get('colors', {})
        calendars = comprehensive_data.get('calendars', [])

        self.logger.info(f"Analyzing {len(events)} events")
        self.logger.info(f"Found {len(calendars)} calendars")

        # Start with calendar usage analysis (fully implemented)
        self.logger.info("\n[1/8] Analyzing calendar usage patterns...")
        calendar_usage = self._analyze_calendar_usage(events, calendars)
        self.logger.info(f"✓ Discovered patterns for {len(calendar_usage.calendars)} calendars")

        # TODO: Implement remaining agents
        # For now, return with just calendar usage patterns
        preferences = UserPreferences(
            user_id=user_id,
            total_events_analyzed=len(events),
            analysis_date_range={
                'start': self._get_earliest_event_date(events),
                'end': self._get_latest_event_date(events)
            },
            timezone=settings.get('timezone'),
            default_event_length=self._parse_default_length(settings.get('defaultEventLength')),
            calendar_usage=calendar_usage,
            # Other patterns will be added as we implement more agents
            title_formatting=TitleFormattingPatterns(),
            description_formatting=DescriptionFormattingPatterns(),
            color_usage=ColorUsagePatterns(),
            location_formatting=LocationFormattingPatterns(),
            duration_patterns=DurationPatterns(),
            timing_patterns=TimingPatterns(),
            contextual_patterns=ContextualPatterns(),
            general_observations=[]
        )

        self.logger.info("\n" + "=" * 60)
        self.logger.info("PATTERN ANALYSIS COMPLETE")
        self.logger.info("=" * 60)

        return preferences

    def _analyze_calendar_usage(
        self,
        events: List[Dict],
        calendars: List[Dict]
    ) -> CalendarUsagePatterns:
        """
        Analyze when/why each calendar is used.

        Critical: Determine when calendars ARE and AREN'T used.
        For each calendar, discover:
        - What types of events go there
        - Patterns: "ONLY for X", "NEVER for Y", "ALL academic events"
        - Whether it's specialized or general-purpose
        """
        self.logger.info("Starting calendar usage analysis...")

        # Group events by calendar
        events_by_calendar = self._group_events_by_calendar(events, calendars)

        calendar_patterns = []

        for calendar in calendars:
            cal_id = calendar.get('id')
            cal_name = calendar.get('summary', 'Unnamed Calendar')
            is_primary = calendar.get('primary', False)

            cal_events = events_by_calendar.get(cal_id, [])

            self.logger.info(f"Analyzing calendar: {cal_name} ({len(cal_events)} events)")

            # Analyze this calendar's usage
            usage_pattern = self._analyze_single_calendar_usage(
                calendar=calendar,
                calendar_events=cal_events,
                all_events=events
            )

            calendar_patterns.append(usage_pattern)

        return CalendarUsagePatterns(calendars=calendar_patterns)

    def _group_events_by_calendar(
        self,
        events: List[Dict],
        calendars: List[Dict]
    ) -> Dict[str, List[Dict]]:
        """
        Group events by their calendar ID.

        Returns:
            Dict mapping calendar_id -> list of events
        """
        events_by_calendar = defaultdict(list)

        for event in events:
            # Use the source calendar metadata added during collection
            cal_id = event.get('_source_calendar_id')

            # Fallback to primary if metadata missing (shouldn't happen with new collection)
            if not cal_id:
                primary_cal = next((cal for cal in calendars if cal.get('primary')), None)
                cal_id = primary_cal.get('id') if primary_cal else 'primary'
                self.logger.warning(f"Event missing calendar metadata, using primary: {event.get('summary')}")

            events_by_calendar[cal_id].append(event)

        return dict(events_by_calendar)

    def _analyze_single_calendar_usage(
        self,
        calendar: Dict,
        calendar_events: List[Dict],
        all_events: List[Dict]
    ) -> CalendarUsagePattern:
        """
        Analyze usage patterns for a single calendar using LLM.

        Args:
            calendar: Calendar metadata
            calendar_events: Events on this calendar
            all_events: All events (for comparison)

        Returns:
            CalendarUsagePattern with discovered patterns
        """
        cal_name = calendar.get('summary', 'Unnamed Calendar')
        cal_id = calendar.get('id')
        is_primary = calendar.get('primary', False)

        # If no events, mark as unused
        if not calendar_events:
            return CalendarUsagePattern(
                calendar_name=cal_name,
                calendar_id=cal_id,
                is_primary=is_primary,
                usage_patterns=[
                    DiscoveredPattern(
                        pattern="This calendar has no events in the analyzed period",
                        confidence="high",
                        examples=[],
                        frequency="always"
                    )
                ],
                event_types=[],
                typical_event_count=0
            )

        # Sample events for analysis (max 100 per calendar for performance)
        sampled_events = self._smart_sample(calendar_events, target=100)

        # Prepare event summaries for LLM
        event_summaries = []
        for event in sampled_events:
            summary = {
                'title': event.get('summary', 'No title'),
                'start': self._extract_date_string(event.get('start')),
                'description': event.get('description', '')[:100] if event.get('description') else None,
                'location': event.get('location'),
                'colorId': event.get('colorId'),
                'recurring': 'recurrence' in event
            }
            event_summaries.append(summary)

        # Calculate some basic stats
        total_events_count = len(all_events)
        calendar_events_count = len(calendar_events)
        percentage_of_total = (calendar_events_count / total_events_count * 100) if total_events_count > 0 else 0

        # Build LLM prompt
        prompt = f"""You are analyzing how a user uses a specific calendar.

CALENDAR: {cal_name}
- ID: {cal_id}
- Primary Calendar: {"YES" if is_primary else "NO"}
- Events on this calendar: {calendar_events_count} ({percentage_of_total:.1f}% of total events)

SAMPLE EVENTS FROM THIS CALENDAR:
{json.dumps(event_summaries[:50], indent=2)}
[Showing first 50 of {len(event_summaries)} sampled events]

YOUR TASK:
Discover patterns in when/why this user uses THIS specific calendar.

CRITICAL: Focus on both POSITIVE and NEGATIVE patterns:
- "ONLY for X type of events" (exclusivity)
- "NEVER for Y type of events" (avoidance)
- "ALL events of type Z" (comprehensive usage)
- "Both X and Y, but not Z" (partial usage)

INSTRUCTIONS:
1. Look at the event titles, types, and characteristics
2. Identify what kinds of events go on THIS calendar
3. Determine if this is a specialized calendar (one purpose) or general-purpose (many purposes)
4. Note any strong patterns in usage vs non-usage
5. For each pattern, provide:
   - Clear description using "ONLY", "NEVER", "ALL", "ALWAYS" etc. when applicable
   - Confidence level (high/medium/low)
   - 2-3 concrete examples from the data
   - Frequency (always/usually/sometimes)

EXAMPLES OF GOOD PATTERNS:
- "Used ONLY for robotics club meetings and events, NEVER for personal or academic events" [always]
- "Primary calendar for ALL academic events including classes, assignments, and exams" [always]
- "Contains both professional meetings and personal appointments" [usually]
- "Used for important events that need high visibility, includes academic deadlines and doctor appointments" [usually]

Return a JSON object with:
{{
    "usage_patterns": [
        {{
            "pattern": "description of the pattern",
            "confidence": "high/medium/low",
            "examples": ["example 1", "example 2"],
            "frequency": "always/usually/sometimes"
        }}
    ],
    "event_types": ["Type 1", "Type 2", "Type 3"]
}}

Analyze and return the patterns:"""

        # Create structured output schema
        class CalendarAnalysisOutput(BaseModel):
            usage_patterns: List[DiscoveredPattern]
            event_types: List[str]

        # Call LLM with structured output
        try:
            analysis_llm = self.llm.with_structured_output(CalendarAnalysisOutput)
            result = analysis_llm.invoke(prompt)

            return CalendarUsagePattern(
                calendar_name=cal_name,
                calendar_id=cal_id,
                is_primary=is_primary,
                usage_patterns=result.usage_patterns,
                event_types=result.event_types,
                typical_event_count=calendar_events_count
            )

        except Exception as e:
            self.logger.error(f"Error analyzing calendar {cal_name}: {e}")
            # Return fallback pattern
            return CalendarUsagePattern(
                calendar_name=cal_name,
                calendar_id=cal_id,
                is_primary=is_primary,
                usage_patterns=[
                    DiscoveredPattern(
                        pattern=f"Contains {calendar_events_count} events (analysis failed)",
                        confidence="low",
                        examples=[],
                        frequency="unknown"
                    )
                ],
                event_types=["Unknown"],
                typical_event_count=calendar_events_count
            )

    # ============================================================================
    # Helper Methods
    # ============================================================================

    def _smart_sample(self, items: List[Dict], target: int) -> List[Dict]:
        """
        Sample items while maintaining diversity.

        Strategy:
        - If fewer than target, return all
        - Otherwise, evenly sample across the list to maintain temporal diversity
        """
        if len(items) <= target:
            return items

        # Evenly sample across the list
        step = len(items) / target
        sampled = []
        for i in range(target):
            index = int(i * step)
            if index < len(items):
                sampled.append(items[index])

        return sampled

    def _extract_date_string(self, start_obj: Optional[Dict]) -> str:
        """Extract readable date string from event start object"""
        if not start_obj:
            return "No date"

        date_time = start_obj.get('dateTime')
        date = start_obj.get('date')

        if date_time:
            return date_time[:16]  # YYYY-MM-DDTHH:MM
        elif date:
            return date  # YYYY-MM-DD

        return "No date"

    def _get_earliest_event_date(self, events: List[Dict]) -> Optional[str]:
        """Get earliest event date from list"""
        if not events:
            return None

        dates = []
        for event in events:
            start = event.get('start', {})
            date_str = start.get('dateTime') or start.get('date')
            if date_str:
                dates.append(date_str)

        return min(dates) if dates else None

    def _get_latest_event_date(self, events: List[Dict]) -> Optional[str]:
        """Get latest event date from list"""
        if not events:
            return None

        dates = []
        for event in events:
            start = event.get('start', {})
            date_str = start.get('dateTime') or start.get('date')
            if date_str:
                dates.append(date_str)

        return max(dates) if dates else None

    def _parse_default_length(self, length_value) -> Optional[int]:
        """Parse default event length from settings"""
        if not length_value:
            return None

        try:
            return int(length_value)
        except (ValueError, TypeError):
            return None
