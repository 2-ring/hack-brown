"""
Lightweight pattern discovery service.

Analyzes calendar history to produce:
1. Category patterns (calendars/categories - what goes where)
2. Style statistics (capitalization, length, brackets, etc.)

This service uses a hybrid approach:
- Statistical analysis for style (no LLM - just counting)
- LLM-based summaries for categories

Note: Colors are not analyzed - they're a visual output determined by category assignment.
"""

from typing import Dict, List, Optional
from collections import defaultdict, Counter
import json
from langchain_anthropic import ChatAnthropic
from pydantic import BaseModel
from config.posthog import get_invoke_config
from config.similarity import PatternDiscoveryConfig


class PatternDiscoveryService:
    """
    Discovers user preferences through:
    - Statistical analysis (no LLM needed)
    - Lightweight LLM-based category pattern summaries

    Categories = Calendars (Google) or Categories (Microsoft) - same concept
    Colors are ignored - they're just visual output, not organizational dimensions
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
                - category_patterns: Dict[calendar_id, summary]
                - style_stats: Dict with statistics
                - total_events_analyzed: int

        Note: Colors are not analyzed - they're automatically assigned based on
        category (calendar) during event creation.
        """

        events = comprehensive_data.get('events', [])
        calendars = comprehensive_data.get('calendars', [])

        print(f"\n{'='*60}")
        print(f"PATTERN DISCOVERY")
        print(f"{'='*60}")
        print(f"Analyzing {len(events)} events from {len(calendars)} calendars...")

        # 1. Statistical analysis (fast, no LLM)
        print("\n[1/2] Computing style statistics...")
        style_stats = self._analyze_style_statistics(events)
        print(f"✓ Style statistics computed")

        # 2. Category patterns (one LLM call per calendar/category)
        print(f"\n[2/2] Analyzing category usage patterns...")
        category_patterns = self._discover_category_patterns(events, calendars)
        print(f"✓ Category patterns discovered for {len(category_patterns)} categories")

        print(f"\n{'='*60}")
        print(f"PATTERN DISCOVERY COMPLETE")
        print(f"{'='*60}\n")

        return {
            'user_id': user_id,
            'category_patterns': category_patterns,
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
    # 2. CATEGORY PATTERNS (One LLM call per calendar/category)
    # =========================================================================

    def _discover_category_patterns(
        self,
        events: List[Dict],
        calendars: List[Dict]
    ) -> Dict[str, Dict]:
        """
        For each category (calendar in Google, category in Microsoft),
        generate a summary of when/why it's used.

        Categories are the primary organizational dimension - not colors.

        Returns:
            Dict mapping category_id to pattern summary
        """

        # Group events by category (calendar)
        events_by_category = self._group_events_by_calendar(events, calendars)

        category_patterns = {}

        for calendar in calendars:
            cal_id = calendar.get('id')
            cal_name = calendar.get('summary', 'Unnamed')
            is_primary = calendar.get('primary', False)

            # Extract calendar color for UI (not used in LLM analysis)
            cal_color = calendar.get('backgroundColor')
            cal_foreground_color = calendar.get('foregroundColor')

            cal_events = events_by_category.get(cal_id, [])

            print(f"  Analyzing: {cal_name} ({len(cal_events)} events)...")

            if not cal_events:
                # Empty category
                category_patterns[cal_id] = {
                    'name': cal_name,
                    'is_primary': is_primary,
                    'color': cal_color,
                    'foreground_color': cal_foreground_color,
                    'description': 'This category has no events in the analyzed period',
                    'event_types': [],
                    'examples': [],
                    'never_contains': []
                }
                continue

            # Sample events for analysis with recency weighting
            # 60% from recent events, 30% mid-term, 10% historical
            sampled = self._smart_sample_weighted(cal_events, target=PatternDiscoveryConfig.TARGET_SAMPLE_SIZE, recency_bias=PatternDiscoveryConfig.RECENCY_BIAS_DEFAULT)

            # Call LLM to analyze this category
            summary = self._analyze_category_with_llm(
                category_name=cal_name,
                is_primary=is_primary,
                events=sampled,
                total_count=len(cal_events)
            )

            category_patterns[cal_id] = {
                'name': cal_name,
                'is_primary': is_primary,
                'color': cal_color,  # For UI display
                'foreground_color': cal_foreground_color,  # For UI display
                **summary
            }

        return category_patterns

    def _analyze_category_with_llm(
        self,
        category_name: str,
        is_primary: bool,
        events: List[Dict],
        total_count: int
    ) -> Dict:
        """
        Use LLM to analyze a single category (calendar) and generate summary.

        Note: Color information is excluded from LLM analysis - colors are
        just visual output, not organizational patterns.

        Returns:
            Dict with description, event_types, examples, never_contains
        """

        # Prepare event summaries (exclude colorId - not relevant for patterns)
        event_summaries = []
        for e in events[:PatternDiscoveryConfig.LLM_MAX_EVENTS]:
            event_summaries.append({
                'title': e.get('summary', ''),
                'date': self._extract_date(e),
                'location': e.get('location', '')[:PatternDiscoveryConfig.LOCATION_DISPLAY_MAX_LENGTH] if e.get('location') else None
            })

        prompt = f"""Analyze this category to understand when/why the user uses it.

CATEGORY: {category_name} {"(PRIMARY)" if is_primary else "(Secondary)"}
TOTAL EVENTS: {total_count}

SAMPLE EVENTS (first 50):
{json.dumps(event_summaries, indent=2)}

YOUR TASK:
Write a concise description of this category's usage pattern.

Focus on:
1. What types of events go here?
2. What NEVER goes here? (if specialized)
3. Is this category specialized or general-purpose?

Provide:
- description: 1-2 sentence summary of what this category is for
- event_types: List of event types (e.g., ["Classes", "Homework", "Office Hours"])
- examples: 5-7 representative example titles from the data
- never_contains: What doesn't belong here (e.g., ["personal events", "work meetings"])

Return structured JSON."""

        # Structured output
        class CategorySummary(BaseModel):
            description: str
            event_types: List[str]
            examples: List[str]
            never_contains: List[str]

        result = self.llm.with_structured_output(CategorySummary).invoke(prompt, config=get_invoke_config("pattern_discovery"))

        return result.model_dump()

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

    def _smart_sample_weighted(self, items: List[Dict], target: int, recency_bias: float = 0.6) -> List[Dict]:
        """
        Sample items with recency weighting - more recent events sampled more heavily.

        Uses a tiered approach with configurable recency bias:
        - Tier 1 (Most Recent): Always included + densely sampled
        - Tier 2 (Mid-term): Moderate sampling
        - Tier 3 (Historical): Light sampling for context

        Research basis: Exponential decay with configurable half-life.
        Default 60/30/10 split based on recommendation system research.

        Args:
            items: List of events (assumed chronologically ordered, oldest first)
            target: Target sample size
            recency_bias: How much to favor recent events (0.5 = equal, 0.8 = heavy recency)
                         - 0.5: 50% recent, 30% mid, 20% old (balanced)
                         - 0.6: 60% recent, 30% mid, 10% old (default, moderate bias)
                         - 0.7: 70% recent, 20% mid, 10% old (strong bias)

        Returns:
            Sampled list with recency weighting
        """
        if len(items) <= target:
            return items

        # Calculate tier boundaries
        # Items are ordered oldest→newest, so recent events are at the END
        total = len(items)

        # Define time periods (assuming events span ~12 months)
        # Recent: Last 25% of events (roughly last 3 months)
        # Mid: Middle 35% of events (roughly 3-9 months ago)
        # Old: First 40% of events (roughly 9+ months ago)
        recent_start = int(total * PatternDiscoveryConfig.RECENT_TIER_BOUNDARY)
        mid_start = int(total * PatternDiscoveryConfig.MID_TIER_BOUNDARY)

        old_events = items[:mid_start]
        mid_events = items[mid_start:recent_start]
        recent_events = items[recent_start:]

        # Allocate samples based on recency bias
        # Ensure we always get at least a few from each tier
        min_per_tier = max(1, int(target * PatternDiscoveryConfig.MIN_SAMPLE_PER_TIER))

        recent_count = max(min_per_tier, int(target * recency_bias))
        mid_count = max(min_per_tier, int(target * (1 - recency_bias) * PatternDiscoveryConfig.MID_TIER_ALLOCATION_WEIGHT))
        old_count = max(min_per_tier, target - recent_count - mid_count)

        # Adjust if we over-allocated
        total_allocated = recent_count + mid_count + old_count
        if total_allocated > target:
            # Reduce proportionally from each tier
            scale = target / total_allocated
            recent_count = int(recent_count * scale)
            mid_count = int(mid_count * scale)
            old_count = target - recent_count - mid_count

        # Sample from each tier
        recent_sampled = self._smart_sample(recent_events, recent_count)
        mid_sampled = self._smart_sample(mid_events, mid_count)
        old_sampled = self._smart_sample(old_events, old_count)

        # Combine in chronological order (oldest first)
        return old_sampled + mid_sampled + recent_sampled

    def _smart_sample_top_heavy(self, items: List[Dict], target: int, guaranteed_recent: int = 10) -> List[Dict]:
        """
        Sample with absolute guarantee of N most recent events + exponential decay for older.

        This is the most aggressive recency bias - ensures you ALWAYS get the last N events
        no matter what, then samples older events with exponential decay.

        Use cases:
        - When recent semester is critical (academic calendars)
        - When user's style may have changed recently
        - When you want to guarantee representation of current patterns

        Args:
            items: List of events (chronologically ordered, oldest first)
            target: Target sample size
            guaranteed_recent: Number of most recent events to always include (default 10)

        Returns:
            Sampled list with guaranteed recent events + exponentially decayed historical sampling
        """
        if len(items) <= target:
            return items

        total = len(items)

        # Always include the last N events
        guaranteed = min(guaranteed_recent, total, target)
        recent_events = items[-guaranteed:]

        # Sample remaining from historical events
        remaining_target = target - guaranteed
        if remaining_target <= 0:
            return recent_events

        historical_events = items[:-guaranteed] if guaranteed > 0 else items

        if len(historical_events) <= remaining_target:
            # Include all historical
            return historical_events + recent_events

        # Exponential sampling from historical events
        # More recent (within historical) gets sampled more
        historical_sampled = self._exponential_sample(historical_events, remaining_target)

        return historical_sampled + recent_events

    def _exponential_sample(self, items: List[Dict], target: int) -> List[Dict]:
        """
        Sample using exponential decay - older events less likely to be selected.

        Uses inverse exponential weighting where item at position i has weight:
        weight[i] = exp(i / len(items)) - more recent items exponentially more likely

        Args:
            items: List of events (chronologically ordered)
            target: Number of samples to take

        Returns:
            Sampled events with exponential recency bias
        """
        if len(items) <= target:
            return items

        import math

        # Calculate exponential weights (position-based, not time-based for simplicity)
        # Recent items get exponentially higher weights
        weights = []
        for i in range(len(items)):
            # Normalize position to 0-1, then apply exponential
            # decay_rate = 2 means recent items are ~7x more likely than oldest
            decay_rate = PatternDiscoveryConfig.EXPONENTIAL_DECAY_RATE
            normalized_pos = i / len(items)
            weight = math.exp(decay_rate * normalized_pos)
            weights.append(weight)

        # Sample indices based on weights
        import random
        sampled_indices = sorted(
            random.choices(range(len(items)), weights=weights, k=target)
        )

        return [items[i] for i in sampled_indices]

    def _extract_date(self, event: Dict) -> str:
        """Extract date string from event"""
        start = event.get('start', {})
        date_str = start.get('dateTime', start.get('date', 'No date'))

        # Return first 10 chars (YYYY-MM-DD)
        return date_str[:10] if date_str != 'No date' else date_str
