"""
Lightweight pattern discovery service.

Analyzes calendar history to produce:
1. Calendar summaries (what goes where)
2. Color patterns (event types → colors)
3. Style statistics (capitalization, length, brackets, etc.)

This service uses a hybrid approach:
- Statistical analysis for style (no LLM - just counting)
- LLM-based summaries for calendars and colors
"""

from typing import Dict, List, Optional
from collections import defaultdict, Counter
import json
from langchain_anthropic import ChatAnthropic
from pydantic import BaseModel


class PatternDiscoveryService:
    """
    Discovers user preferences through:
    - Statistical analysis (no LLM needed)
    - Lightweight LLM-based pattern summaries
    """

    def __init__(self, llm: ChatAnthropic):
        """
        Initialize pattern discovery service.

        Args:
            llm: LangChain ChatAnthropic instance
        """
        self.llm = llm

    def discover_patterns(
        self,
        comprehensive_data: Dict,
        user_id: str
    ) -> Dict:
        """
        Main entry point: Discover all patterns from calendar history.

        Args:
            comprehensive_data: From DataCollectionService with keys:
                - events: List[Dict]
                - settings: Dict
                - colors: Dict
                - calendars: List[Dict]
            user_id: User identifier

        Returns:
            Dict with:
                - user_id: str
                - calendar_patterns: Dict[calendar_id, summary]
                - color_patterns: List[pattern descriptions]
                - style_stats: Dict with statistics
                - total_events_analyzed: int
        """

        events = comprehensive_data.get('events', [])
        calendars = comprehensive_data.get('calendars', [])

        print(f"\n{'='*60}")
        print(f"PATTERN DISCOVERY")
        print(f"{'='*60}")
        print(f"Analyzing {len(events)} events from {len(calendars)} calendars...")

        # 1. Statistical analysis (fast, no LLM)
        print("\n[1/3] Computing style statistics...")
        style_stats = self._analyze_style_statistics(events)
        print(f"✓ Style statistics computed")

        # 2. Calendar summaries (one LLM call per calendar)
        print(f"\n[2/3] Analyzing calendar usage patterns...")
        calendar_patterns = self._discover_calendar_patterns(events, calendars)
        print(f"✓ Calendar patterns discovered for {len(calendar_patterns)} calendars")

        # 3. Color patterns (one LLM call)
        print(f"\n[3/3] Discovering color usage patterns...")
        color_patterns = self._discover_color_patterns(events)
        print(f"✓ Color patterns discovered")

        print(f"\n{'='*60}")
        print(f"PATTERN DISCOVERY COMPLETE")
        print(f"{'='*60}\n")

        return {
            'user_id': user_id,
            'calendar_patterns': calendar_patterns,
            'color_patterns': color_patterns,
            'style_stats': style_stats,
            'total_events_analyzed': len(events)
        }

    # =========================================================================
    # 1. STYLE STATISTICS (Pure Python - No LLM)
    # =========================================================================

    def _analyze_style_statistics(self, events: List[Dict]) -> Dict:
        """
        Compute style statistics through simple counting.
        NO LLM calls - just Python logic.

        Returns:
            Dict with capitalization, length, special_chars, common_words
        """

        titles = [e.get('summary', '') for e in events if e.get('summary')]

        if not titles:
            return self._empty_style_stats()

        total = len(titles)

        # 1. Capitalization pattern
        title_case_count = sum(self._is_title_case(t) for t in titles)
        lower_case_count = sum(t.islower() for t in titles)
        upper_case_count = sum(t.isupper() for t in titles)

        cap_percentages = {
            'title_case': title_case_count / total,
            'lower_case': lower_case_count / total,
            'upper_case': upper_case_count / total
        }

        dominant_cap = max(cap_percentages, key=cap_percentages.get)
        cap_consistency = cap_percentages[dominant_cap]

        # 2. Length statistics
        word_counts = [len(t.split()) for t in titles]
        avg_length = sum(word_counts) / len(word_counts)

        # 3. Special character usage
        uses_brackets = sum('[' in t or ']' in t for t in titles) / total
        uses_parentheses = sum('(' in t or ')' in t for t in titles) / total
        uses_emojis = sum(any(ord(c) > 127 for c in t) for t in titles) / total
        uses_dashes = sum('-' in t for t in titles) / total
        uses_colons = sum(':' in t for t in titles) / total

        # 4. Common words (for understanding abbreviations/patterns)
        all_words = ' '.join(titles).lower().split()
        word_freq = Counter(all_words)
        common_words = [word for word, count in word_freq.most_common(10)]

        return {
            'capitalization': {
                'pattern': dominant_cap.replace('_', ' ').title(),
                'consistency': f"{cap_consistency:.0%}",
                'breakdown': {
                    'title_case': f"{cap_percentages['title_case']:.0%}",
                    'lower_case': f"{cap_percentages['lower_case']:.0%}",
                    'upper_case': f"{cap_percentages['upper_case']:.0%}"
                }
            },
            'length': {
                'average_words': round(avg_length, 1),
                'typical_range': f"{min(word_counts)}-{max(word_counts)} words"
            },
            'special_chars': {
                'uses_brackets': uses_brackets > 0.2,
                'brackets_frequency': f"{uses_brackets:.0%}",
                'uses_parentheses': uses_parentheses > 0.2,
                'parentheses_frequency': f"{uses_parentheses:.0%}",
                'uses_emojis': uses_emojis > 0.05,
                'uses_dashes': uses_dashes > 0.2,
                'uses_colons': uses_colons > 0.2
            },
            'common_words': common_words
        }

    def _is_title_case(self, text: str) -> bool:
        """Check if text is in Title Case"""
        # Consider it title case if most words start with capital
        words = text.split()
        if not words:
            return False

        capitalized = sum(w[0].isupper() for w in words if w)
        return capitalized / len(words) > 0.7

    def _empty_style_stats(self) -> Dict:
        """Return empty style stats when no events"""
        return {
            'capitalization': {'pattern': 'Unknown', 'consistency': '0%'},
            'length': {'average_words': 0, 'typical_range': '0-0 words'},
            'special_chars': {},
            'common_words': []
        }

    # =========================================================================
    # 2. CALENDAR PATTERNS (One LLM call per calendar)
    # =========================================================================

    def _discover_calendar_patterns(
        self,
        events: List[Dict],
        calendars: List[Dict]
    ) -> Dict[str, Dict]:
        """
        For each calendar, generate a summary of when/why it's used.

        Returns:
            Dict mapping calendar_id to pattern summary
        """

        # Group events by calendar
        events_by_calendar = self._group_events_by_calendar(events, calendars)

        calendar_patterns = {}

        for calendar in calendars:
            cal_id = calendar.get('id')
            cal_name = calendar.get('summary', 'Unnamed')
            is_primary = calendar.get('primary', False)

            cal_events = events_by_calendar.get(cal_id, [])

            print(f"  Analyzing: {cal_name} ({len(cal_events)} events)...")

            if not cal_events:
                # Empty calendar
                calendar_patterns[cal_id] = {
                    'name': cal_name,
                    'is_primary': is_primary,
                    'description': 'This calendar has no events in the analyzed period',
                    'event_types': [],
                    'examples': [],
                    'never_contains': []
                }
                continue

            # Sample events for analysis
            sampled = self._smart_sample(cal_events, target=100)

            # Call LLM to analyze this calendar
            summary = self._analyze_calendar_with_llm(
                calendar_name=cal_name,
                is_primary=is_primary,
                events=sampled,
                total_count=len(cal_events)
            )

            calendar_patterns[cal_id] = {
                'name': cal_name,
                'is_primary': is_primary,
                **summary
            }

        return calendar_patterns

    def _analyze_calendar_with_llm(
        self,
        calendar_name: str,
        is_primary: bool,
        events: List[Dict],
        total_count: int
    ) -> Dict:
        """
        Use LLM to analyze a single calendar and generate summary.

        Returns:
            Dict with description, event_types, examples, never_contains
        """

        # Prepare event summaries
        event_summaries = []
        for e in events[:50]:  # Show first 50 to LLM
            event_summaries.append({
                'title': e.get('summary', ''),
                'date': self._extract_date(e),
                'colorId': e.get('colorId'),
                'location': e.get('location', '')[:50] if e.get('location') else None
            })

        prompt = f"""Analyze this calendar to understand when/why the user uses it.

CALENDAR: {calendar_name} {"(PRIMARY CALENDAR)" if is_primary else "(Secondary Calendar)"}
TOTAL EVENTS: {total_count}

SAMPLE EVENTS (first 50):
{json.dumps(event_summaries, indent=2)}

YOUR TASK:
Write a concise description of this calendar's usage pattern.

Focus on:
1. What types of events go here?
2. What NEVER goes here? (if specialized)
3. Is this calendar specialized or general-purpose?

Provide:
- description: 1-2 sentence summary of what this calendar is for
- event_types: List of event types (e.g., ["Classes", "Homework", "Office Hours"])
- examples: 5-7 representative example titles from the data
- never_contains: What doesn't belong here (e.g., ["personal events", "work meetings"])

Return structured JSON."""

        # Structured output
        class CalendarSummary(BaseModel):
            description: str
            event_types: List[str]
            examples: List[str]
            never_contains: List[str]

        result = self.llm.with_structured_output(CalendarSummary).invoke(prompt)

        return result.model_dump()

    # =========================================================================
    # 3. COLOR PATTERNS (One LLM call total)
    # =========================================================================

    def _discover_color_patterns(self, events: List[Dict]) -> List[str]:
        """
        Discover how user assigns colors to events.

        Returns:
            List of pattern strings like:
            - "Academic classes → Turquoise (colorId 2)"
            - "Deadlines → Red (colorId 11)"
        """

        # Filter events that have colors
        colored_events = [e for e in events if e.get('colorId')]

        if not colored_events:
            return ["No color patterns detected (most events use default colors)"]

        # Sample for analysis
        sampled = self._smart_sample(colored_events, target=200)

        # Group by color to show distribution
        by_color = defaultdict(list)
        for e in sampled:
            color = e.get('colorId')
            by_color[color].append(e.get('summary', ''))

        # Prepare for LLM - show examples per color
        color_examples = {}
        for color_id, titles in by_color.items():
            color_examples[color_id] = titles[:10]  # Top 10 examples per color

        prompt = f"""Analyze color usage patterns in this user's calendar.

EVENTS GROUPED BY COLOR ID:
{json.dumps(color_examples, indent=2)}

GOOGLE CALENDAR COLOR IDS:
1 = Lavender
2 = Turquoise/Sage
3 = Purple/Grape
4 = Pink/Flamingo
5 = Yellow/Banana
6 = Orange/Tangerine
7 = Cyan/Peacock
8 = Gray/Graphite
9 = Blue/Blueberry
10 = Green/Basil
11 = Red/Tomato

YOUR TASK:
Discover patterns in color usage. What types of events get which colors?

Look for:
- Semantic patterns (e.g., "homework" → red, "classes" → turquoise)
- Consistency (always/usually/sometimes)
- Event type associations

Return a list of pattern strings formatted like:
- "Academic classes and lectures → Turquoise (colorId 2) [always]"
- "Assignment deadlines → Red (colorId 11) [always]"
- "Personal appointments → Blue (colorId 9) [usually]"

Each pattern should specify:
1. Event type
2. Color name and ID
3. Frequency [always/usually/sometimes]

Return structured JSON with patterns list."""

        class ColorPatterns(BaseModel):
            patterns: List[str]

        result = self.llm.with_structured_output(ColorPatterns).invoke(prompt)

        return result.patterns

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _group_events_by_calendar(
        self,
        events: List[Dict],
        calendars: List[Dict]
    ) -> Dict[str, List[Dict]]:
        """Group events by calendar ID"""
        by_calendar = defaultdict(list)

        # Build calendar ID lookup
        cal_ids = {cal['id'] for cal in calendars}

        for event in events:
            # Get calendar ID from event metadata
            cal_id = event.get('_source_calendar_id')

            # Fallback to primary if missing
            if not cal_id or cal_id not in cal_ids:
                primary_cal = next((cal for cal in calendars if cal.get('primary')), None)
                cal_id = primary_cal.get('id') if primary_cal else 'primary'

            by_calendar[cal_id].append(event)

        return dict(by_calendar)

    def _smart_sample(self, items: List[Dict], target: int) -> List[Dict]:
        """
        Sample items evenly across the list for temporal diversity.

        Args:
            items: List of events
            target: Target sample size

        Returns:
            Sampled list maintaining temporal distribution
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

    def _extract_date(self, event: Dict) -> str:
        """Extract date string from event"""
        start = event.get('start', {})
        date_str = start.get('dateTime', start.get('date', 'No date'))

        # Return first 10 chars (YYYY-MM-DD)
        return date_str[:10] if date_str != 'No date' else date_str
