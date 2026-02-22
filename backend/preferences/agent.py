"""
PERSONALIZE stage — batch-personalizes CalendarEvents to match user style.

Processes all events from a session in a single LLM call, providing cross-event
context so the model can apply consistent formatting (e.g., recognizing all events
come from the same ENGN 0520 syllabus).

Uses:
- Input summary from extraction (source context for the batch)
- Discovered patterns (calendar summaries)
- Deduplicated reference events from user history (ranked by relevance)
- Correction learning from past user edits
- Per-event context: surrounding events, duration stats, location history
- Task-based architecture: only relevant tasks are assigned per event

See backend/PIPELINE.md for architecture overview.
"""

import statistics
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from typing import List, Dict, Optional
from datetime import datetime

from pydantic import BaseModel, create_model, Field as PydanticField

from core.base_agent import BaseAgent
from core.prompt_loader import load_prompt
from extraction.models import CalendarEvent, CalendarDateTime
from preferences.similarity import ProductionSimilaritySearch
from config.posthog import get_invoke_config

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

# Task registry — each task maps to a description file, output field type, and merge target.
# Only tasks in the batch's union get included in the prompt and output model.
TASK_DEFINITIONS = {
    'title': {
        'file': 'preferences/tasks/title.txt',
        'field_type': (str, PydanticField(description="Event title reformatted to match user's naming style")),
        'merge_field': 'summary',
    },
    'description': {
        'file': 'preferences/tasks/description.txt',
        'field_type': (Optional[str], PydanticField(default=None, description="Event description, enhanced or unchanged")),
        'merge_field': 'description',
    },
    'calendar': {
        'file': 'preferences/tasks/calendar.txt',
        'field_type': (Optional[str], PydanticField(default=None, description="Calendar name from the available calendars list, or null")),
        'merge_field': 'calendar',
    },
    'end_time': {
        'file': 'preferences/tasks/end_time.txt',
        'field_type': (Optional[CalendarDateTime], PydanticField(default=None, description="Inferred end time matching the start's format and timezone")),
        'merge_field': 'end',
    },
    'location': {
        'file': 'preferences/tasks/location.txt',
        'field_type': (Optional[str], PydanticField(default=None, description="Resolved location or null")),
        'merge_field': 'location',
    },
}

# Max reference events to include in the batch prompt
MAX_REFERENCE_EVENTS = 25


class PersonalizationAgent(BaseAgent):
    """
    Batch-personalizes CalendarEvents to match the user's style.

    Processes all events in a single LLM call with cross-event context.
    Task-based architecture — each event gets only the tasks it needs:
    - title: Match user's naming conventions
    - description: Enhance or preserve descriptions
    - calendar: Select from available calendars
    - end_time: Infer missing end times
    - location: Resolve against user's history
    """

    def __init__(self, llm: ChatAnthropic):
        super().__init__("Personalize")
        self.llm = llm
        self.similarity_search = None

    def build_similarity_index(self, historical_events: Optional[List[Dict]] = None):
        """Pre-build the similarity search index (call before execute_batch)."""
        if historical_events and len(historical_events) >= 3 and self.similarity_search is None:
            self.similarity_search = ProductionSimilaritySearch()
            self.similarity_search.build_index(historical_events)

    def execute_batch(
        self,
        events: List[CalendarEvent],
        discovered_patterns: Optional[Dict] = None,
        historical_events: Optional[List[Dict]] = None,
        user_id: Optional[str] = None,
        input_summary: str = '',
    ) -> List[CalendarEvent]:
        """
        Personalize CalendarEvents in a single LLM call.

        Provides cross-event context so the LLM can apply consistent formatting
        (e.g., recognizing all events come from the same ENGN 0520 syllabus).
        """
        if not events:
            raise ValueError("No events provided for batch personalization")
        if not discovered_patterns:
            return events

        category_patterns = discovered_patterns.get('category_patterns', {})
        show_calendar = len(category_patterns) > 1

        # Auto-assign calendar when only one non-primary calendar exists
        if not show_calendar and len(category_patterns) == 1:
            cal_id = next(iter(category_patterns))
            pattern = category_patterns[cal_id]
            if not pattern.get('is_primary'):
                for event in events:
                    event.calendar = cal_id

        # --- Assign tasks per event ---
        per_event_tasks = [self._assign_tasks(evt, show_calendar) for evt in events]
        all_tasks = sorted(set(t for tasks in per_event_tasks for t in tasks))

        # --- Parallel pre-fetch per-event context ---
        per_event_data = self._prefetch_all_event_contexts(
            events, historical_events, user_id
        )

        # --- Deduplicate and rank reference events across all events ---
        reference_events = self._dedup_and_rank_reference_events(per_event_data)

        # --- Deduplicate corrections ---
        all_corrections = []
        seen_correction_keys = set()
        for data in per_event_data:
            for correction in data.get('corrections', []):
                key = (
                    str(correction.get('system_suggestion', {}).get('summary', '')),
                    str(correction.get('user_final', {}).get('summary', '')),
                )
                if key not in seen_correction_keys:
                    seen_correction_keys.add(key)
                    all_corrections.append(correction)
        correction_context = self._format_correction_context(all_corrections)

        # --- Load task descriptions (only tasks in the union) ---
        task_descriptions = []
        for task_name in all_tasks:
            task_def = TASK_DEFINITIONS[task_name]
            task_descriptions.append(load_prompt(task_def['file']))

        # --- Build per-event template contexts ---
        event_contexts = []
        for i, (event, tasks, data) in enumerate(
            zip(events, per_event_tasks, per_event_data)
        ):
            ctx = {
                'index': i,
                'summary': event.summary,
                'event_json': event.model_dump_json(indent=2),
                'task_list': ', '.join(tasks),
                'has_location': bool(event.location and event.location.strip()),
            }

            # Duration + surrounding events only for end_time task
            if 'end_time' in tasks:
                ctx['duration_lines'] = self._build_duration_lines(
                    data.get('duration_stats', {})
                )
                ctx['surrounding_event_lines'] = self._build_surrounding_event_lines(
                    data.get('surrounding_events', [])
                )
            else:
                ctx['duration_lines'] = []
                ctx['surrounding_event_lines'] = []

            # Location context for location task
            ctx['location_match_lines'] = self._build_location_match_lines(
                data.get('location_matches', [])
            )
            ctx['location_correction_lines'] = self._build_location_correction_lines(
                data.get('location_corrections', [])
            )

            event_contexts.append(ctx)

        # --- Build prompt ---
        system_prompt = load_prompt(
            "preferences/prompts/preferences_batch.txt",
            input_summary=input_summary or 'No summary available.',
            task_descriptions=task_descriptions,
            reference_events_display=self._build_reference_events_display(
                reference_events
            ),
            correction_context=correction_context,
            show_calendar_section=show_calendar,
            calendar_entries=(
                self._build_calendar_entries(category_patterns) if show_calendar else []
            ),
            event_contexts=event_contexts,
            num_events=len(events),
        )

        # --- Build dynamic output model from task union ---
        output_model = self._build_batch_output_model(all_tasks, len(events))
        structured_llm = self.llm.with_structured_output(output_model, include_raw=True)

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Personalize all {len(events)} events."),
        ]
        raw_result = structured_llm.invoke(
            messages, config=get_invoke_config("personalization")
        )
        result = raw_result['parsed']

        # --- Merge results back into events ---
        for event_output, event, tasks in zip(result.events, events, per_event_tasks):
            for task_name in tasks:
                task_def = TASK_DEFINITIONS[task_name]
                merge_field = task_def['merge_field']
                value = getattr(event_output, task_name, None)

                if task_name == 'calendar' and value is not None:
                    value = self._resolve_calendar_id(value, category_patterns)

                if value is not None or task_name != 'title':
                    setattr(event, merge_field, value)

        return events

    @staticmethod
    def _assign_tasks(event: CalendarEvent, show_calendar: bool) -> List[str]:
        """Determine which personalization tasks apply to an event."""
        tasks = ['title', 'description', 'location']
        if show_calendar:
            tasks.append('calendar')
        is_all_day = event.start.date is not None
        has_end = event.end is not None
        if not is_all_day and not has_end:
            tasks.append('end_time')
        return tasks

    def _prefetch_all_event_contexts(
        self,
        events: List[CalendarEvent],
        historical_events: Optional[List[Dict]],
        user_id: Optional[str],
    ) -> List[Dict]:
        """Pre-fetch per-event context data (similar events, surrounding, etc.) in parallel."""
        contexts = [None] * len(events)

        # Scale down k per event as batch grows
        k_per_event = max(2, 7 - len(events) // 5)

        def _fetch_context(i, event):
            similar = self._find_similar_events(event, historical_events, k=k_per_event)
            duration_stats = self._compute_duration_stats(similar)
            surrounding = self._fetch_surrounding_events(event, user_id)
            location_matches = self._fetch_location_history(event, user_id)
            corrections = self._query_corrections(event, user_id)
            location_corrections = self._extract_location_corrections(corrections)
            return i, {
                'similar_events': similar,
                'duration_stats': duration_stats,
                'surrounding_events': surrounding,
                'location_matches': location_matches,
                'corrections': corrections,
                'location_corrections': location_corrections,
            }

        with ThreadPoolExecutor(max_workers=min(len(events), 10)) as pool:
            futures = {
                pool.submit(_fetch_context, i, evt): i
                for i, evt in enumerate(events)
            }
            for future in as_completed(futures):
                try:
                    idx, ctx = future.result()
                    contexts[idx] = ctx
                except Exception as e:
                    i = futures[future]
                    logger.warning(f"Context prefetch failed for event {i}: {e}")
                    contexts[i] = {
                        'similar_events': [], 'duration_stats': {},
                        'surrounding_events': [], 'location_matches': [],
                        'corrections': [], 'location_corrections': [],
                    }

        return contexts

    @staticmethod
    def _dedup_and_rank_reference_events(
        per_event_data: List[Dict],
    ) -> List[Dict]:
        """
        Deduplicate similar events across all events in the batch,
        rank by match_count * mean_similarity, return top N.
        """
        seen: Dict[tuple, Dict] = {}  # (title, calendar) → tracking dict

        for data in per_event_data:
            for evt in data.get('similar_events', []):
                key = (evt['title'], evt['calendar'])
                if key not in seen:
                    seen[key] = {
                        'entry': evt,
                        'scores': [evt['similarity']],
                    }
                else:
                    seen[key]['scores'].append(evt['similarity'])

        if not seen:
            return []

        # Rank by match_count * mean_similarity
        ranked = []
        for data in seen.values():
            match_count = len(data['scores'])
            mean_sim = sum(data['scores']) / match_count
            rank_score = match_count * mean_sim
            ranked.append((data['entry'], rank_score))

        ranked.sort(key=lambda x: x[1], reverse=True)
        return [entry for entry, _ in ranked[:MAX_REFERENCE_EVENTS]]

    @staticmethod
    def _build_reference_events_display(reference_events: List[Dict]) -> List[str]:
        """Format reference events for the batch prompt (no similarity scores)."""
        display = []
        for i, evt in enumerate(reference_events, 1):
            parts = [f'{i}. "{evt["title"]}"']
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
    def _build_batch_output_model(all_tasks: List[str], num_events: int):
        """
        Build a dynamic Pydantic model for the batch output.

        The model contains an 'events' list where each item has an 'index' field
        plus one field per task in the union. Tasks not assigned to a given event
        should be null in the output.
        """
        event_fields = {
            'index': (int, PydanticField(description="0-based index matching input event order")),
        }
        for task_name in all_tasks:
            task_def = TASK_DEFINITIONS[task_name]
            event_fields[task_name] = task_def['field_type']

        EventOutput = create_model('EventTaskOutput', **event_fields)

        return create_model(
            'BatchPersonalizationOutput',
            events=(List[EventOutput], PydanticField(
                description=f"Exactly {num_events} outputs, one per event, in order."
            )),
        )

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
        historical_events: Optional[List[Dict]] = None,
        k: int = 7,
    ) -> List[Dict]:
        """
        Find similar historical events and include temporal data for duration inference.

        Args:
            event: CalendarEvent to find similar events for
            historical_events: User's historical events
            k: Number of similar events to return

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
                k=k,
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

        context = "<corrections>\n"
        context += "You've made similar formatting mistakes before. The user corrected them.\n"
        context += "Avoid repeating these mistakes:\n"

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

        context += "\nApply these learnings to avoid similar mistakes.\n"
        context += "</corrections>"

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
