"""
Agent 5: Preference Application
Applies user's learned preferences to extracted facts.
"""

from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from .base import BaseAgent
from models.agent_models import ExtractedFacts
from models.user_preferences import UserPreferences
from utils.logging_utils import log_agent_execution, app_logger


class PreferenceApplicationAgent(BaseAgent):
    """
    Enhances extracted facts with user's learned preferences.
    Optional agent that runs between fact extraction and formatting.
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

    @log_agent_execution("Agent5_PreferenceApplication")
    def execute(
        self,
        facts: ExtractedFacts,
        user_preferences: UserPreferences
    ) -> ExtractedFacts:
        """
        Apply user preferences to enhance extracted facts.

        Args:
            facts: ExtractedFacts from Agent 2
            user_preferences: Learned user preferences

        Returns:
            Enhanced ExtractedFacts with preferences applied
        """
        if not facts:
            raise ValueError("No facts provided for preference application")

        if not user_preferences:
            app_logger.info("No user preferences available, returning facts unchanged")
            return facts

        # Build preference context for LLM
        preferences_context = self._build_preferences_context(user_preferences)

        # Build few-shot examples
        few_shot_examples = self._build_few_shot_examples()

        # Combine into full prompt
        full_system_prompt = f"""{self.system_prompt}

{preferences_context}

{few_shot_examples}

IMPORTANT - CALENDAR SELECTION:
- Analyze event content (title, type, location) and match against calendar usage patterns
- Use the calendar_name from patterns (e.g., "UAPPLY", "Classes", "Work", "Default")
- If a pattern clearly matches with high confidence, assign that calendar
- If no pattern matches or confidence is low, set calendar to "Default" (primary)
- Only use high-confidence calendar patterns
- Always include the calendar field in your response, even if it's "Default"
"""

        preference_prompt = ChatPromptTemplate.from_messages([
            ("system", full_system_prompt),
            ("human", f"""YOUR TASK - Apply these same techniques to the following event facts:

{facts.model_dump()}

INSTRUCTIONS:
For EACH fact in the input, follow this exact process:
1. Identify which patterns apply (if any) - be specific
2. Explain your reasoning - why do these patterns match?
3. Apply the patterns to enhance the fact - show the enhanced version

IMPORTANT:
- Only apply patterns that clearly match - don't force patterns that don't fit
- If no patterns apply, keep the fact as-is and use default calendar
- Preserve all original information while adding enhancements
- Be consistent with the user's discovered patterns

Provide enhanced facts:""")
        ])

        # Run preference application
        chain = preference_prompt | self.llm
        result = chain.invoke({})

        return result

    def _build_preferences_context(self, preferences: UserPreferences) -> str:
        """Build preference context string for LLM"""

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

    def _build_few_shot_examples(self) -> str:
        """Build few-shot examples for pattern application"""
        return """
EXAMPLES OF PATTERN APPLICATION (Learn from these):

EXAMPLE 1 - Calendar Selection Based on Content:
Input fact: {"summary": "UAPPLY team meeting", "start": "2024-03-15T14:00:00"}
Step 1 - Identify applicable patterns:
  ✓ Calendar usage: Events with "UAPPLY" → UAPPLY calendar
Step 2 - Reasoning: Event title contains "UAPPLY", matches organizational pattern
Step 3 - Apply patterns:
Enhanced fact: {"summary": "UAPPLY team meeting", "start": "2024-03-15T14:00:00", "calendar": "UAPPLY"}

EXAMPLE 2 - Academic Event to Primary:
Input fact: {"summary": "MATH 0540 office hours", "start": "2024-03-15T15:00:00"}
Step 1 - Identify applicable patterns:
  ✓ Title format: Office hours use "COURSE OH" format
  ✓ Calendar: Primary calendar used for ALL academic events
Step 2 - Reasoning: Office hours is academic, user's primary holds all academics
Step 3 - Apply patterns:
Enhanced fact: {"summary": "MATH 0540 OH", "start": "2024-03-15T15:00:00", "calendar": "Default"}

EXAMPLE 3 - No Specific Pattern:
Input fact: {"summary": "dentist appointment", "start": "2024-03-16T10:00:00"}
Step 1 - Identify applicable patterns: None match
Step 2 - Reasoning: Personal appointment, no specialized calendar, use primary
Step 3 - Apply patterns:
Enhanced fact: {"summary": "dentist appointment", "start": "2024-03-16T10:00:00", "calendar": "Default"}

EXAMPLE 4 - Multiple Patterns Applied:
Input fact: {"summary": "CS class", "start": "2024-03-17T09:00:00", "duration_minutes": 50}
Step 1 - Identify applicable patterns:
  ✓ Title format: Class titles include course code
  ✓ Duration: Lectures are typically 50 minutes (already correct)
  ✓ Calendar: Academic classes go to Classes calendar
  ✓ Color: Academic events use color ID 2
Step 2 - Reasoning: Matches multiple academic event patterns
Step 3 - Apply patterns:
Enhanced fact: {"summary": "CS 0200 Lecture", "start": "2024-03-17T09:00:00", "duration_minutes": 50, "calendar": "Classes", "colorId": "2"}

---"""
