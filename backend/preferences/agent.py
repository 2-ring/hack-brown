"""
PERSONALIZE stage — applies user's learned preferences to a CalendarEvent.

Uses:
- Discovered patterns (calendar summaries)
- Few-shot learning from similar historical events (with temporal data)
- Correction learning from past user edits
- Surrounding events for temporal constraint awareness
- Location history for location resolution

See backend/PIPELINE.md for architecture overview.
"""

import statistics
import logging
import time as _time
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from typing import List, Dict, Optional
from datetime import datetime

from pydantic import create_model, Field as PydanticField

from core.base_agent import BaseAgent
from core.prompt_loader import load_prompt
from extraction.models import CalendarEvent, CalendarDateTime
from preferences.similarity import ProductionSimilaritySearch
from config.posthog import capture_llm_generation

logger = logging.getLogger(__name__)

DEFAULT_DURATIONS = [
    "**No duration data from similar events.** Consider these typical durations as a starting point:",
    "- Meetings, calls: 60 min",
    "- Classes, lectures: 50 min",
    "- Meals (lunch, dinner, coffee): 60 min",
    "- Appointments (doctor, dentist): 60 min",
    "- Workouts, gym: 60 min",
    "- Quick tasks (pickup, errand): 30 min",
    "- Parties, social events: 120 min",
    "- Workshops, seminars: 90 min",
]


class PersonalizationAgent(BaseAgent):
    """
    Personalizes a CalendarEvent to match the user's style.

    Section-based decision-making agent that handles:
    - Title formatting (match user's naming conventions)
    - Description enhancement
    - Calendar selection (by Calendar ID)
    - End time inference (when missing)
    - Location resolution (against user's history)
    """

    def __init__(self, llm: ChatAnthropic):
        super().__init__("Personalize")
        self.llm = llm
        self.similarity_search = None

        # Resolve provider/model for manual PostHog capture
        from config.text import get_text_provider, get_model_specs
        self._provider = get_text_provider('personalize')
        self._model_name = get_model_specs(self._provider)['model_name']

    def execute(
        self,
        event: CalendarEvent,
        discovered_patterns: Optional[Dict] = None,
        historical_events: Optional[List[Dict]] = None,
        user_id: Optional[str] = None
    ) -> CalendarEvent:
        """
        Apply user preferences to personalize a calendar event.

        Args:
            event: CalendarEvent from temporal resolver
            discovered_patterns: Patterns from PatternDiscoveryService
            historical_events: User's historical events for similarity search
            user_id: User UUID (for querying corrections and location history)

        Returns:
            Personalized CalendarEvent
        """
        if not event:
            raise ValueError("No event provided for personalization")

        if not discovered_patterns:
            return event

        # --- Gather raw data ---

        similar_events = self._find_similar_events(event, historical_events)
        duration_stats = self._compute_duration_stats(similar_events)
        surrounding_events = self._fetch_surrounding_events(event, user_id)
        location_matches = self._fetch_location_history(event, user_id)

        corrections = self._query_corrections(event, user_id)
        correction_context = self._format_correction_context(corrections)
        location_corrections = self._extract_location_corrections(corrections)

        calendar_distribution = self._compute_calendar_distribution(similar_events)
        category_patterns = discovered_patterns.get('category_patterns', {})

        # --- Determine section visibility ---

        is_all_day = event.start.date is not None
        has_end_time = event.end is not None
        has_location = bool(event.location and event.location.strip())
        show_calendar_section = len(category_patterns) > 1
        show_temporal_section = not is_all_day and not has_end_time

        # Auto-assign calendar when only one exists (skip if it's primary — null = primary)
        if not show_calendar_section and len(category_patterns) == 1:
            cal_id = next(iter(category_patterns))
            pattern = category_patterns[cal_id]
            if not pattern.get('is_primary'):
                event.calendar = cal_id

        # --- Pre-format all display data ---

        system_prompt = load_prompt(
            "preferences/prompts/preferences.txt",
            event_json=event.model_dump_json(indent=2),
            correction_context=correction_context,
            has_location=has_location,
            raw_location=event.location or '',

            # Section visibility
            show_calendar_section=show_calendar_section,
            show_temporal_section=show_temporal_section,

            # Pre-computed display lists
            similar_events_display=self._build_similar_events_display(similar_events),
            calendar_entries=self._build_calendar_entries(category_patterns),
            calendar_distribution_lines=self._build_distribution_lines(calendar_distribution),
            duration_lines=self._build_duration_lines(duration_stats),
            surrounding_event_lines=self._build_surrounding_event_lines(surrounding_events),
            temporal_approach=self._build_temporal_approach(duration_stats, surrounding_events),
            location_match_lines=self._build_location_match_lines(location_matches),
            location_correction_lines=self._build_location_correction_lines(location_corrections),
        )

        # Build dynamic output model — only includes fields LLM is allowed to set
        output_model = self._build_output_model(show_calendar_section, show_temporal_section)
        structured_llm = self.llm.with_structured_output(output_model, include_raw=True)

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content="Apply personalization to this event."),
        ]
        start = _time.time()
        raw_result = structured_llm.invoke(messages)
        duration_ms = (_time.time() - start) * 1000
        result = raw_result['parsed']

        # Manual PostHog capture (flat — no chain wrapper)
        input_tokens = None
        output_tokens = None
        try:
            usage = raw_result['raw'].usage_metadata
            input_tokens = usage.get('input_tokens')
            output_tokens = usage.get('output_tokens')
        except (AttributeError, TypeError):
            pass
        capture_llm_generation(
            "personalization", self._model_name, self._provider, duration_ms,
            input_tokens=input_tokens, output_tokens=output_tokens,
            input_content=event.model_dump_json(),
            output_content=result.model_dump_json() if hasattr(result, 'model_dump_json') else str(result),
        )

        # Merge LLM output into original event (preserves all untouched fields)
        event.summary = result.summary
        event.description = result.description
        event.location = result.location
        if show_calendar_section:
            event.calendar = self._resolve_calendar_id(
                result.calendar, category_patterns
            )
        if show_temporal_section:
            event.end = result.end

        return event

    # =========================================================================
    # Dynamic output model
    # =========================================================================

    @staticmethod
    def _build_output_model(show_calendar_section: bool, show_temporal_section: bool):
        """
        Build a Pydantic model containing only the fields the LLM is allowed to set.

        The LLM physically cannot modify fields outside this schema (start, recurrence,
        attendees, etc.). After invocation, results are merged back into the original event.
        """
        fields = {
            'summary': (str, PydanticField(description="Event title reformatted to match user's naming style")),
            'description': (Optional[str], PydanticField(default=None, description="Event description, enhanced or unchanged")),
            'location': (Optional[str], PydanticField(default=None, description="Physical location, resolved against user's history")),
        }

        if show_calendar_section:
            fields['calendar'] = (Optional[str], PydanticField(default=None, description="Calendar name from the available calendars list, or null if unsure"))

        if show_temporal_section:
            fields['end'] = (CalendarDateTime, PydanticField(description="Inferred end time matching the start's format and timezone"))

        return create_model('PersonalizationOutput', **fields)

    @staticmethod
    def _resolve_calendar_id(
        calendar_name: Optional[str], category_patterns: Dict
    ) -> Optional[str]:
        """
        Map the LLM's calendar name output back to a calendar ID.

        Returns None for the primary calendar (null = primary everywhere),
        or a specific provider calendar ID for non-primary calendars.
        """
        # Build name → ID lookup (case-insensitive)
        name_to_id = {
            pattern.get('name', cal_id).lower(): cal_id
            for cal_id, pattern in category_patterns.items()
        }

        # Try exact match
        resolved_id = None
        if calendar_name and calendar_name.lower() in name_to_id:
            resolved_id = name_to_id[calendar_name.lower()]
        else:
            # Fallback to primary calendar
            for cal_id, pattern in category_patterns.items():
                if pattern.get('is_primary'):
                    resolved_id = cal_id
                    break
            else:
                # Last resort: first calendar
                resolved_id = next(iter(category_patterns))

        # Primary calendar → None (null = primary everywhere)
        if resolved_id:
            pattern = category_patterns.get(resolved_id, {})
            if pattern.get('is_primary'):
                return None

        return resolved_id

    # =========================================================================
    # Display builders — all Jinja conditional/formatting logic lives here
    # =========================================================================

    @staticmethod
    def _build_similar_events_display(similar_events: List[Dict]) -> List[str]:
        display = []
        for i, evt in enumerate(similar_events, 1):
            parts = [f'{i}. "{evt["title"]}" (similarity: {evt["similarity"]})']
            line2 = f'   Calendar: {evt["calendar"]}'
            if evt.get('location'):
                line2 += f'  |  Location: {evt["location"]}'
            parts.append(line2)

            time_parts = []
            if evt.get('start_time'):
                time_parts.append(f'Start: {evt["start_time"]}')
            if evt.get('end_time'):
                time_parts.append(f'End: {evt["end_time"]}')
            if evt.get('duration_minutes'):
                time_parts.append(f'({evt["duration_minutes"]} min)')
            if time_parts:
                parts.append('   ' + '  →  '.join(time_parts))

            if evt.get('is_all_day'):
                parts.append('   Type: All-day event')

            desc = evt.get('description', '')
            if desc:
                truncated = desc[:80] + '...' if len(desc) > 80 else desc
                parts.append(f'   Description: {truncated}')
            else:
                parts.append('   Description: (none)')

            display.append('\n'.join(parts))
        return display

    @staticmethod
    def _build_calendar_entries(category_patterns: Dict) -> List[str]:
        entries = []
        for cal_id, pattern in category_patterns.items():
            lines = []
            name = pattern.get('name', cal_id)
            lines.append(f'**{name}**')
            lines.append(f'  Description: {pattern.get("description", "")}')
            if pattern.get('event_types'):
                lines.append(f'  Event types: {", ".join(pattern["event_types"])}')
            if pattern.get('examples'):
                lines.append(f'  Example titles: {", ".join(pattern["examples"][:5])}')
            if pattern.get('never_contains'):
                lines.append(f'  Never contains: {", ".join(pattern["never_contains"])}')
            entries.append('\n'.join(lines))
        return entries

    @staticmethod
    def _build_distribution_lines(calendar_distribution: List[Dict]) -> List[str]:
        lines = []
        for entry in calendar_distribution:
            count = entry['count']
            suffix = 's' if count != 1 else ''
            lines.append(f'{entry["calendar"]}: {count} event{suffix} ({entry["percentage"]}%)')
        return lines

    @staticmethod
    def _build_duration_lines(duration_stats: Dict) -> List[str]:
        if not duration_stats:
            return DEFAULT_DURATIONS

        sorted_vals = sorted(duration_stats['values'])
        individual = ', '.join(str(v) for v in sorted_vals)
        return [
            "**Duration patterns from similar events:**",
            f"- Median: {duration_stats['median_minutes']} min, Range: {duration_stats['min_minutes']}–{duration_stats['max_minutes']} min",
            f"- Individual durations: {individual} min",
        ]

    @staticmethod
    def _build_surrounding_event_lines(surrounding_events: List[Dict]) -> List[str]:
        lines = []
        for evt in surrounding_events:
            time = evt.get('start_time') or evt.get('start_date', '')
            line = f'{evt.get("summary", "Untitled")}: {time}'
            if evt.get('end_time'):
                line += f' → {evt["end_time"]}'
            if evt.get('is_all_day'):
                line += ' (all-day)'
            lines.append(line)
        return lines

    @staticmethod
    def _build_temporal_approach(duration_stats: Dict, surrounding_events: List[Dict]) -> str:
        parts = []
        if duration_stats:
            parts.append(
                "Start with the duration patterns from similar events — the user's own history "
                "is the best predictor. Consider whether the median makes sense for this specific "
                "event, or if something about it suggests it might be shorter or longer than typical."
            )
        else:
            parts.append(
                "Think about what kind of event this is and how long it would realistically last. "
                "Use the typical durations above as a starting point, but adjust based on context "
                "clues in the title or description."
            )

        if surrounding_events:
            parts.append(
                "Consider the nearby events on the user's calendar. Think about whether the context "
                "of both events means they shouldn't overlap — sometimes people are just double-booked "
                "and that's fine. Also consider whether buffer time between events makes sense given "
                "what the events are (e.g., travel time between locations, or back-to-back meetings "
                "that naturally run into each other)."
            )

        return "\n\n".join(parts)

    @staticmethod
    def _build_location_match_lines(location_matches: List[Dict]) -> List[str]:
        return [
            f'{loc["count"]}x "{loc["location"]}" (match: {loc["match_score"]}) — last used with: "{loc["last_used_with"]}"'
            for loc in location_matches
        ]

    @staticmethod
    def _build_location_correction_lines(location_corrections: List[Dict]) -> List[str]:
        return [
            f'Corrected "{c["from"]}" → "{c["to"]}"'
            for c in location_corrections
        ]

    # =========================================================================
    # Data fetching — unchanged
    # =========================================================================

    def _find_similar_events(
        self,
        event: CalendarEvent,
        historical_events: Optional[List[Dict]] = None
    ) -> List[Dict]:
        """
        Find similar historical events and include temporal data for duration inference.

        Returns list of dicts for display builders (not a formatted string).
        """
        if not historical_events or len(historical_events) < 3:
            return []

        # Build similarity index if not already built (reused across events in session)
        if self.similarity_search is None:
            self.similarity_search = ProductionSimilaritySearch()
            self.similarity_search.build_index(historical_events)

        query_event = {
            'title': event.summary or '',
            'all_day': event.start.date is not None,
            'calendar_name': event.calendar or 'Default'
        }

        try:
            similar = self.similarity_search.find_similar_with_diversity(
                query_event,
                k=7,
                diversity_threshold=0.85
            )
        except Exception:
            return []

        if not similar:
            return []

        results = []
        for evt, score, breakdown in similar:
            entry = {
                'title': evt.get('summary', evt.get('title', 'Untitled')),
                'calendar': evt.get('_source_calendar_name', evt.get('calendar_name', '')),
                'location': evt.get('location', ''),
                'description': evt.get('description', ''),
                'start_time': evt.get('start_time', ''),
                'end_time': evt.get('end_time', ''),
                'is_all_day': evt.get('is_all_day', False),
                'similarity': round(score, 2),
                'duration_minutes': None,
            }

            # Compute duration if both start and end are present
            if entry['start_time'] and entry['end_time']:
                try:
                    start = datetime.fromisoformat(entry['start_time'])
                    end = datetime.fromisoformat(entry['end_time'])
                    entry['duration_minutes'] = int((end - start).total_seconds() / 60)
                except (ValueError, TypeError):
                    pass

            results.append(entry)

        return results

    @staticmethod
    def _compute_duration_stats(similar_events: List[Dict]) -> Dict:
        """Compute aggregate duration statistics from similar events."""
        durations = [
            e['duration_minutes'] for e in similar_events
            if e.get('duration_minutes') and e['duration_minutes'] > 0
        ]

        if not durations:
            return {}

        return {
            'median_minutes': int(statistics.median(durations)),
            'min_minutes': min(durations),
            'max_minutes': max(durations),
            'count': len(durations),
            'values': durations,
        }

    @staticmethod
    def _compute_calendar_distribution(similar_events: List[Dict]) -> List[Dict]:
        """Compute which calendars similar events belong to, with counts and percentages."""
        if not similar_events:
            return []

        counts: Dict[str, int] = {}
        for evt in similar_events:
            cal = evt.get('calendar', '')
            if cal:
                counts[cal] = counts.get(cal, 0) + 1

        total = sum(counts.values())
        if total == 0:
            return []

        distribution = [
            {
                'calendar': cal,
                'count': count,
                'percentage': round(100 * count / total),
            }
            for cal, count in counts.items()
        ]
        distribution.sort(key=lambda x: x['count'], reverse=True)
        return distribution

    # =========================================================================
    # External data fetchers
    # =========================================================================

    def _fetch_surrounding_events(
        self,
        event: CalendarEvent,
        user_id: Optional[str]
    ) -> List[Dict]:
        """Fetch temporally closest events for scheduling constraint awareness."""
        if not user_id or event.start.date is not None:
            return []

        target_time = event.start.dateTime
        if not target_time:
            return []

        try:
            from events.service import EventService
            return EventService.get_surrounding_events(
                user_id=user_id,
                target_time=target_time,
            )
        except Exception as e:
            logger.debug(f"Could not fetch surrounding events: {e}")
            return []

    def _fetch_location_history(
        self,
        event: CalendarEvent,
        user_id: Optional[str]
    ) -> List[Dict]:
        """Fetch similar locations from user's event history."""
        if not user_id or not event.location or not event.location.strip():
            return []

        try:
            from events.service import EventService
            return EventService.search_location_history(
                user_id=user_id,
                query_location=event.location,
            )
        except Exception as e:
            logger.debug(f"Could not fetch location history: {e}")
            return []

    # =========================================================================
    # Corrections
    # =========================================================================

    def _query_corrections(
        self,
        event: CalendarEvent,
        user_id: Optional[str]
    ) -> List[Dict]:
        """Query past user corrections similar to this event."""
        if not user_id:
            return []

        try:
            from feedback.correction_query_service import CorrectionQueryService
            query_service = CorrectionQueryService()
            return query_service.query_for_preference_application(
                user_id=user_id,
                facts=event.model_dump(),
                k=5
            ) or []
        except Exception:
            return []

    def _format_correction_context(self, corrections: List[Dict]) -> str:
        """Format corrections as a learning context string for the prompt."""
        if not corrections:
            return ""

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

            if 'title_change' in correction and correction['title_change']:
                tc = correction['title_change']
                context += f"    → Title: '{tc.get('from')}' → '{tc.get('to')}' ({tc.get('change_type')})\n"

            if 'calendar_change' in correction and correction['calendar_change']:
                cc = correction['calendar_change']
                context += f"    → Calendar: '{cc.get('from')}' → '{cc.get('to')}'\n"

            if 'time_change' in correction and correction['time_change']:
                tc = correction['time_change']
                context += f"    → Time: {tc.get('from')} → {tc.get('to')} ({tc.get('change_type')})\n"

        context += "\n" + "="*60 + "\n"
        context += "Apply these learnings to avoid similar mistakes.\n"

        return context

    def _extract_location_corrections(self, corrections: List[Dict]) -> List[Dict]:
        """Extract location-specific corrections from the correction list."""
        location_corrections = []
        for correction in corrections:
            if 'location' not in correction.get('fields_changed', []):
                continue
            system = correction.get('system_suggestion', {})
            user = correction.get('user_final', {})
            from_loc = system.get('location', '')
            to_loc = user.get('location', '')
            if from_loc and to_loc and from_loc != to_loc:
                location_corrections.append({
                    'from': from_loc,
                    'to': to_loc,
                })
        return location_corrections

    def _format_facts_summary(self, facts: Dict) -> str:
        """Format facts dict as a brief summary."""
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
        """Format event dict as a brief summary."""
        parts = []
        if event.get('summary'):
            parts.append(f"title:'{event['summary']}'")
        if event.get('calendar'):
            parts.append(f"calendar:{event['calendar']}")
        if event.get('start'):
            start = event['start']
            if 'dateTime' in start:
                parts.append(f"time:{start['dateTime']}")
            elif 'date' in start:
                parts.append(f"date:{start['date']}")
        return ', '.join(parts) if parts else '(empty)'
