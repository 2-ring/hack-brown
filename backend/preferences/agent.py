"""
Agent 5: Preference Application

Applies user's learned preferences to extracted facts using:
- Discovered patterns (calendar summaries, color patterns, style stats)
- Few-shot learning from similar historical events
"""

from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from typing import List, Dict, Optional

from core.base_agent import BaseAgent
from extraction.models import ExtractedFacts
from preferences.models import UserPreferences
from preferences.similarity import ProductionSimilaritySearch


class PreferenceApplicationAgent(BaseAgent):
    """
    Single agent that handles:
    - Calendar selection
    - Color selection
    - Title formatting

    Uses discovered patterns + few-shot examples for personalization.
    """

    def __init__(self, llm: ChatAnthropic):
        """
        Initialize Preference Application Agent.

        Args:
            llm: Language model instance
        """
        super().__init__("Agent5_PreferenceApplication")
        self.llm = llm.with_structured_output(ExtractedFacts)
        self.system_prompt = self.load_prompt("preferences.txt")
        self.similarity_search = None  # Initialized when historical events are provided

    def execute(
        self,
        facts: ExtractedFacts,
        discovered_patterns: Optional[Dict] = None,
        user_preferences: Optional[UserPreferences] = None,
        historical_events: Optional[List[Dict]] = None,
        user_id: Optional[str] = None
    ) -> ExtractedFacts:
        """
        Apply user preferences to enhance extracted facts.

        Args:
            facts: ExtractedFacts from Agent 2
            discovered_patterns: Patterns from PatternDiscoveryService (preferred)
                - category_patterns: Dict[category_id, summary]
                - style_stats: Dict
            user_preferences: Legacy UserPreferences (fallback, optional)
            historical_events: User's historical events for similarity search
            user_id: User UUID (for querying corrections)

        Returns:
            Enhanced ExtractedFacts with category + formatting applied
            (Colors are automatically applied based on category during write)
        """
        if not facts:
            raise ValueError("No facts provided for preference application")

        # Prefer discovered_patterns, fall back to user_preferences
        if not discovered_patterns and not user_preferences:
            self.log_info("No patterns or preferences available, returning facts unchanged")
            return facts

        # Build preference context for LLM
        if discovered_patterns:
            preferences_context = self._build_patterns_context(discovered_patterns)
            self.log_info("Using discovered patterns for personalization")
        else:
            preferences_context = self._build_preferences_context(user_preferences)
            self.log_info("Using legacy preferences for personalization")

        # Build few-shot examples from similar historical events
        few_shot_examples = self._build_few_shot_examples_from_history(
            facts, historical_events
        )

        # Build correction learning context (learn from past mistakes)
        correction_context = self._build_correction_learning_context(facts, user_id)

        # Combine into full prompt
        full_system_prompt = f"""{self.system_prompt}

{preferences_context}

{few_shot_examples}

{correction_context}

IMPORTANT - TASK OVERVIEW:
You must format this event to match the user's personal style:
1. SELECT CALENDAR: Based on calendar patterns and similar examples
2. SELECT COLOR: Based on color patterns and similar examples
3. FORMAT TITLE: Match capitalization, length, and structure from similar examples
4. SET ALL FIELDS: Include all event details (start, end, duration, location, description)

CALENDAR SELECTION:
- Review calendar patterns above - which calendar fits this event type?
- Check which calendars similar examples belong to
- If a pattern clearly matches, assign that calendar
- If no pattern matches or confidence is low, use "Default" (primary calendar)
- Always include the calendar field in your response

Think step-by-step, then output the complete enhanced event.
"""

        preference_prompt = ChatPromptTemplate.from_messages([
            ("system", full_system_prompt),
            ("human", f"""NEW EVENT TO FORMAT:

{facts.model_dump_json(indent=2)}

Apply the user's patterns and style to format this event completely.
Return the enhanced ExtractedFacts with calendar, colorId, and formatted title.""")
        ])

        # Run preference application (single LLM call)
        chain = preference_prompt | self.llm
        result = chain.invoke({})

        return result

    # =========================================================================
    # NEW: Build context from discovered patterns
    # =========================================================================

    def _build_patterns_context(self, patterns: Dict) -> str:
        """
        Build preference context from discovered patterns.

        Args:
            patterns: Output from PatternDiscoveryService

        Returns:
            Formatted context string for LLM
        """

        category_patterns = patterns.get('category_patterns', {})
        style_stats = patterns.get('style_stats', {})
        total_events = patterns.get('total_events_analyzed', 0)

        # Format category summaries
        category_text = self._format_category_summaries(category_patterns)

        # Format style stats
        style_text = self._format_style_stats(style_stats)

        context = f"""
USER'S PREFERENCES (Learned from {total_events} historical events)

{'='*60}
CATEGORY USAGE PATTERNS:
{'='*60}
{category_text}

{'='*60}
STYLE PREFERENCES:
{'='*60}
{style_text}

Note: Colors are handled automatically based on category assignment.
"""
        return context

    def _format_category_summaries(self, category_patterns: Dict) -> str:
        """Format category patterns for prompt"""
        if not category_patterns:
            return "  (No category patterns discovered)"

        lines = []
        for cat_id, pattern in category_patterns.items():
            name = pattern.get('name', cat_id)
            is_primary = pattern.get('is_primary', False)
            desc = pattern.get('description', '')
            event_types = pattern.get('event_types', [])
            examples = pattern.get('examples', [])
            never_contains = pattern.get('never_contains', [])

            primary_str = " ⭐ PRIMARY" if is_primary else ""

            lines.append(f"\nCategory: {name}{primary_str}")
            lines.append(f"  Description: {desc}")

            if event_types:
                lines.append(f"  Event types: {', '.join(event_types)}")

            if examples:
                lines.append(f"  Example titles:")
                for ex in examples[:5]:
                    lines.append(f"    - \"{ex}\"")

            if never_contains:
                lines.append(f"  Never contains: {', '.join(never_contains)}")

        return "\n".join(lines)

    def _format_style_stats(self, style_stats: Dict) -> str:
        """Format style statistics for prompt"""
        if not style_stats:
            return "  (No style statistics available)"

        cap = style_stats.get('capitalization', {})
        length = style_stats.get('length', {})
        special = style_stats.get('special_chars', {})

        lines = [
            f"  Capitalization: {cap.get('pattern', 'Unknown')} ({cap.get('consistency', 'unknown')} consistent)",
            f"  Typical length: {length.get('average_words', '?')} words",
        ]

        if special.get('uses_brackets'):
            lines.append(f"  Uses brackets in titles: Yes ({special.get('brackets_frequency', '?')} of events)")

        if special.get('uses_parentheses'):
            lines.append(f"  Uses parentheses in titles: Yes ({special.get('parentheses_frequency', '?')} of events)")

        if special.get('uses_emojis'):
            lines.append(f"  Uses emojis in titles: Yes")

        if special.get('uses_dashes'):
            lines.append(f"  Uses dashes in titles: Yes")

        if special.get('uses_colons'):
            lines.append(f"  Uses colons in titles: Yes")

        return "\n".join(lines)

    # =========================================================================
    # LEGACY: Build context from UserPreferences (backward compatibility)
    # =========================================================================

    def _build_preferences_context(self, preferences: UserPreferences) -> str:
        """Build preference context string for LLM (legacy format)"""

        def format_patterns(pattern_list):
            """Format a list of DiscoveredPattern objects for LLM"""
            if not pattern_list:
                return "  (No patterns discovered yet)"
            formatted = []
            for i, p in enumerate(pattern_list, 1):
                freq_str = f" [{p.frequency}]" if p.frequency else ""
                formatted.append(f"  {i}. {p.pattern}{freq_str}")
                if p.examples:
                    formatted.append(f"     Examples: {', '.join(p.examples[:2])}")
            return "\n".join(formatted)

        context = f"""
USER PREFERENCES (Learned from {preferences.total_events_analyzed} historical events)

TITLE FORMATTING PATTERNS:
{format_patterns(preferences.title_formatting.patterns)}

DESCRIPTION FORMATTING PATTERNS:
{format_patterns(preferences.description_formatting.patterns)}

COLOR USAGE PATTERNS:
{format_patterns(preferences.color_usage.patterns)}

LOCATION FORMATTING PATTERNS:
{format_patterns(preferences.location_formatting.patterns)}

DURATION PATTERNS:
{format_patterns(preferences.duration_patterns.patterns)}

TIMING PATTERNS:
{format_patterns(preferences.timing_patterns.patterns)}

CALENDAR USAGE PATTERNS:"""

        # Add calendar usage info
        if preferences.calendar_usage.calendars:
            for cal in preferences.calendar_usage.calendars:
                primary_str = " (PRIMARY)" if cal.is_primary else ""
                context += f"\n\n  Calendar: {cal.calendar_name}{primary_str}"
                context += f"\n  Event types: {', '.join(cal.event_types) if cal.event_types else 'Various'}"
                if cal.usage_patterns:
                    context += "\n  Usage patterns:"
                    for pattern in cal.usage_patterns:
                        freq_str = f" [{pattern.frequency}]" if pattern.frequency else ""
                        context += f"\n    - {pattern.pattern}{freq_str}"
        else:
            context += "\n  (No calendar usage patterns discovered yet)"

        context += f"""

CONTEXTUAL PATTERNS (When X, do Y):
{format_patterns(preferences.contextual_patterns.patterns)}

GENERAL OBSERVATIONS:
"""
        if preferences.general_observations:
            for obs in preferences.general_observations:
                context += f"\n  - {obs}"
        else:
            context += "\n  (None yet)"

        context += f"""

USER SETTINGS:
- Timezone: {preferences.timezone}
- Default event length: {preferences.default_event_length} minutes
"""
        return context

    # =========================================================================
    # Few-shot examples from historical events
    # =========================================================================

    def _build_few_shot_examples_from_history(
        self,
        query_facts: ExtractedFacts,
        historical_events: Optional[List[Dict]] = None
    ) -> str:
        """
        Build few-shot examples from similar historical events using semantic similarity.

        Args:
            query_facts: The facts we're trying to enhance
            historical_events: User's historical calendar events

        Returns:
            Formatted few-shot examples string
        """
        if not historical_events or len(historical_events) < 3:
            # Fallback to static examples if not enough history
            return self._build_few_shot_examples()

        # Build similarity index if not already built
        if self.similarity_search is None:
            self.log_info("Building similarity index...")
            self.similarity_search = ProductionSimilaritySearch()
            self.similarity_search.build_index(historical_events)

        # Create query event from extracted facts
        query_event = {
            'title': query_facts.summary or '',
            'all_day': query_facts.time is None,
            'calendar_name': getattr(query_facts, 'calendar', 'Default')
        }

        # Find similar events with diversity
        try:
            similar_events = self.similarity_search.find_similar_with_diversity(
                query_event,
                k=7,  # Get 7 diverse examples
                diversity_threshold=0.85
            )
        except Exception as e:
            self.log_warning(f"Similarity search failed: {e}, using static examples")
            return self._build_few_shot_examples()

        if not similar_events:
            return self._build_few_shot_examples()

        # Format as few-shot examples
        examples_text = f"""
{'='*60}
SIMILAR EVENTS FROM YOUR HISTORY (Learn from these):
{'='*60}

These are real events you've created that are similar to the new event.
Use them to understand your formatting style.
"""

        for i, (event, score, breakdown) in enumerate(similar_events, 1):
            # Extract relevant fields
            title = event.get('summary', event.get('title', 'Untitled'))
            calendar = event.get('_source_calendar_name', event.get('calendar_name', 'Unknown'))
            color_id = event.get('colorId', '')
            location = event.get('location', '')

            examples_text += f"""
Example {i} (Similarity: {score:.2f}):
  Title: "{title}"
  Calendar: {calendar}"""

            if color_id:
                examples_text += f"\n  Color ID: {color_id}"
            if location:
                examples_text += f"\n  Location: {location}"

        examples_text += f"\n\n{'='*60}\n"

        return examples_text

    def _build_few_shot_examples(self) -> str:
        """Build static few-shot examples as fallback when no history available"""
        return """
EXAMPLE PATTERN APPLICATION (Generic examples - adapt to user's style):

These are examples of how to apply patterns. The actual formatting should
match the user's discovered patterns and similar events.
"""

    def _build_correction_learning_context(
        self,
        facts: ExtractedFacts,
        user_id: Optional[str]
    ) -> str:
        """
        Build correction learning context from past user corrections.

        Queries corrections where Agent 5 saw similar facts and user made changes.
        Shows what was wrong and what user wanted instead.

        Args:
            facts: Current ExtractedFacts Agent 5 is processing
            user_id: User UUID for querying their corrections

        Returns:
            Formatted correction learning context for prompt
        """
        if not user_id:
            return ""

        try:
            from feedback.correction_query_service import CorrectionQueryService

            # Convert facts to dict for querying
            facts_dict = facts.model_dump()

            # Query corrections (Agent 5 use case)
            query_service = CorrectionQueryService()
            corrections = query_service.query_for_preference_application(
                user_id=user_id,
                facts=facts_dict,
                k=5  # Top 5 most similar corrections
            )

            if not corrections:
                return ""

            # Format corrections as learning examples
            context = f"""
{'='*60}
CORRECTION LEARNING (Learn from past mistakes):
{'='*60}
You've made similar formatting mistakes before. The user corrected them.
Avoid repeating these mistakes:

"""

            for i, correction in enumerate(corrections, 1):
                extracted_facts = correction.get('extracted_facts', {})
                system_suggestion = correction.get('system_suggestion', {})
                user_final = correction.get('user_final', {})
                fields_changed = correction.get('fields_changed', [])

                context += f"\nCorrection {i}:\n"
                context += f"  Facts you saw: {self._format_facts_summary(extracted_facts)}\n"
                context += f"  You formatted as: {self._format_event_summary(system_suggestion)}\n"
                context += f"  User changed it to: {self._format_event_summary(user_final)}\n"
                context += f"  What changed: {', '.join(fields_changed)}\n"

                # Add specific change details
                if 'title_change' in correction and correction['title_change']:
                    tc = correction['title_change']
                    context += f"    → Title: '{tc.get('from')}' → '{tc.get('to')}' ({tc.get('change_type')})\n"

                if 'calendar_change' in correction and correction['calendar_change']:
                    cc = correction['calendar_change']
                    context += f"    → Calendar: '{cc.get('from')}' → '{cc.get('to')}'\n"

                if 'color_change' in correction and correction['color_change']:
                    colc = correction['color_change']
                    context += f"    → Color: {colc.get('from')} → {colc.get('to')}\n"

                if 'time_change' in correction and correction['time_change']:
                    tc = correction['time_change']
                    context += f"    → Time: {tc.get('from')} → {tc.get('to')} ({tc.get('change_type')})\n"

            context += "\n" + "="*60 + "\n"
            context += "Apply these learnings to avoid similar mistakes.\n"

            self.log_info(f"Found {len(corrections)} relevant corrections for learning")
            return context

        except Exception as e:
            # Don't fail - just log and continue without correction learning
            self.log_error(f"Failed to query corrections: {e}")
            return ""

    def _format_facts_summary(self, facts: Dict) -> str:
        """Format facts dict as a brief summary"""
        parts = []
        if facts.get('title'):
            parts.append(f"title:'{facts['title']}'")
        if facts.get('date'):
            parts.append(f"date:{facts['date']}")
        if facts.get('time'):
            parts.append(f"time:{facts['time']}")
        if facts.get('location'):
            parts.append(f"loc:'{facts['location']}'")
        return ', '.join(parts) if parts else '(empty)'

    def _format_event_summary(self, event: Dict) -> str:
        """Format event dict as a brief summary"""
        parts = []
        if event.get('summary'):
            parts.append(f"title:'{event['summary']}'")
        if event.get('calendar'):
            parts.append(f"calendar:{event['calendar']}")
        if event.get('colorId'):
            parts.append(f"color:{event['colorId']}")
        if event.get('start'):
            start = event['start']
            if 'dateTime' in start:
                parts.append(f"time:{start['dateTime']}")
            elif 'date' in start:
                parts.append(f"date:{start['date']}")
        return ', '.join(parts) if parts else '(empty)'
