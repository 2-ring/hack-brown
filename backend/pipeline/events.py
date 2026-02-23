"""
Event Service - Manages unified event storage and operations.
Handles both DropCal-created events and provider-synced events.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
import numpy as np

import logging
from database.models import Event, Session
from preferences.similarity import compute_embedding, compute_embeddings_batch
from config.database import QueryLimits

logger = logging.getLogger(__name__)


class EventService:
    """Service for managing events in the unified events table."""

    @staticmethod
    def create_dropcal_event(
        user_id: str,
        session_id: str,
        summary: str,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        is_all_day: bool = False,
        description: Optional[str] = None,
        location: Optional[str] = None,
        timezone: Optional[str] = None,
        calendar_name: Optional[str] = None,
        color_id: Optional[str] = None,
        original_input: Optional[str] = None,
        extracted_facts: Optional[Dict] = None,
        system_suggestion: Optional[Dict] = None,
        recurrence: Optional[list] = None,
        attendees: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Create a DropCal event (draft or confirmed).

        Computes embedding synchronously for immediate similarity search.

        Args:
            user_id: User's UUID
            session_id: Session UUID that created this event
            summary: Event title
            start_time, end_time: Timestamps for non-all-day events
            start_date, end_date: Dates for all-day events
            is_all_day: Whether event is all-day
            description: Event description
            location: Event location
            timezone: IANA timezone
            calendar_name: Provider calendar ID (stored in DB column 'calendar_name')
            color_id: Color ID
            original_input: Original raw text input
            extracted_facts: STRUCTURE output
            system_suggestion: PERSONALIZE output

        Returns:
            Created event dict
        """
        # Compute embedding synchronously (DropCal events need immediate search)
        event_embedding = None
        if summary:
            embedding_text = summary
            if description:
                embedding_text += f" {description}"
            event_embedding = compute_embedding(embedding_text).tolist()

        # Create event
        event = Event.create(
            user_id=user_id,
            provider="dropcal",
            summary=summary,
            start_time=start_time,
            end_time=end_time,
            start_date=start_date,
            end_date=end_date,
            is_all_day=is_all_day,
            is_draft=True,  # DropCal events start as drafts
            description=description,
            location=location,
            timezone=timezone,
            calendar_name=calendar_name,
            color_id=color_id,
            original_input=original_input,
            extracted_facts=extracted_facts,
            system_suggestion=system_suggestion,
            event_embedding=event_embedding,
            recurrence=recurrence,
            attendees=attendees
        )

        # Link to session
        Session.add_event(session_id, event['id'])

        return event

    @staticmethod
    def create_dropcal_events_batch(
        user_id: str,
        session_id: str,
        events_data: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Create multiple DropCal events without embeddings, then batch-compute
        embeddings and update all events in one pass.

        Saves events to DB immediately (so the frontend can display them),
        then computes embeddings efficiently via a single model.encode() call.

        Args:
            user_id: User's UUID
            session_id: Session UUID
            events_data: List of dicts with keys matching create_dropcal_event params

        Returns:
            List of created event dicts
        """
        if not events_data:
            return []

        # 1. Save all events without embeddings
        created_events = []
        for data in events_data:
            event = Event.create(
                user_id=user_id,
                provider="dropcal",
                is_draft=True,
                event_embedding=None,
                **data,
            )
            Session.add_event(session_id, event['id'])
            created_events.append(event)

        # 2. Batch-compute embeddings in a single model.encode() call
        texts = []
        for data in events_data:
            text = data.get('summary', '')
            if data.get('description'):
                text += f" {data['description']}"
            texts.append(text)

        try:
            embeddings = compute_embeddings_batch(texts)
            for event, embedding in zip(created_events, embeddings):
                Event.update(event['id'], {
                    "event_embedding": embedding.tolist()
                })
        except Exception as e:
            logger.warning(f"Batch embedding failed, events saved without embeddings: {e}")

        return created_events

    @staticmethod
    def create_provider_event(
        user_id: str,
        provider: str,
        provider_account_id: str,
        provider_event_id: str,
        summary: str,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        is_all_day: bool = False,
        description: Optional[str] = None,
        location: Optional[str] = None,
        timezone: Optional[str] = None,
        calendar_name: Optional[str] = None,
        color_id: Optional[str] = None,
        compute_embedding_now: bool = False
    ) -> Dict[str, Any]:
        """
        Create a provider event (from Google Calendar, etc.).

        Embeddings computed async by background job (unless compute_embedding_now=True).

        Args:
            user_id: User's UUID
            provider: Provider name ('google', 'apple', 'microsoft')
            provider_account_id: Provider account email
            provider_event_id: Provider's event ID
            summary: Event title
            start_time, end_time: Timestamps
            start_date, end_date: Dates for all-day
            is_all_day: All-day flag
            description, location, timezone: Event details
            calendar_name: Provider calendar ID (stored in DB column 'calendar_name')
            color_id: Color ID
            compute_embedding_now: Whether to compute embedding synchronously (default: False)

        Returns:
            Created event dict
        """
        # For provider events, embedding is optional (computed by background job)
        event_embedding = None
        if compute_embedding_now and summary:
            embedding_text = summary
            if description:
                embedding_text += f" {description}"
            event_embedding = compute_embedding(embedding_text).tolist()

        event = Event.create(
            user_id=user_id,
            provider=provider,
            provider_account_id=provider_account_id,
            provider_event_id=provider_event_id,
            summary=summary,
            start_time=start_time,
            end_time=end_time,
            start_date=start_date,
            end_date=end_date,
            is_all_day=is_all_day,
            is_draft=False,  # Provider events are never drafts
            description=description,
            location=location,
            timezone=timezone,
            calendar_name=calendar_name,
            color_id=color_id,
            event_embedding=event_embedding
        )

        return event

    @staticmethod
    def bulk_create_provider_events(
        user_id: str,
        provider: str,
        provider_account_id: str,
        events_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Bulk create provider events (for initial sync).

        Embeddings computed later by background job for performance.

        Args:
            user_id: User's UUID
            provider: Provider name
            provider_account_id: Provider account
            events_data: List of event dicts to create

        Returns:
            List of created events
        """
        created_events = []

        for event_data in events_data:
            event = EventService.create_provider_event(
                user_id=user_id,
                provider=provider,
                provider_account_id=provider_account_id,
                compute_embedding_now=False,  # Async for bulk
                **event_data
            )
            created_events.append(event)

        return created_events

    @staticmethod
    def get_historical_events(
        user_id: str,
        limit: int = QueryLimits.DEFAULT_HISTORICAL_EVENTS_LIMIT
    ) -> List[Dict[str, Any]]:
        """
        Get historical events for pattern learning (provider events only).

        Args:
            user_id: User's UUID
            limit: Max events to return

        Returns:
            List of historical events
        """
        return Event.get_historical_events(user_id, limit)

    @staticmethod
    def get_historical_events_with_embeddings(
        user_id: str,
        limit: int = QueryLimits.DEFAULT_EVENTS_WITH_EMBEDDINGS_LIMIT
    ) -> List[Dict[str, Any]]:
        """
        Get historical events that have embeddings (for similarity search).

        Args:
            user_id: User's UUID
            limit: Max events to return

        Returns:
            List of events with embeddings
        """
        from database.supabase_client import get_supabase
        supabase = get_supabase()

        response = supabase.table("events").select("*")\
            .eq("user_id", user_id)\
            .neq("provider", "dropcal")\
            .not_.is_("event_embedding", None)\
            .is_("deleted_at", None)\
            .order("start_time", desc=True)\
            .limit(limit).execute()

        return response.data

    @staticmethod
    def get_surrounding_events(
        user_id: str,
        target_time: str,
        k: int = QueryLimits.SURROUNDING_EVENTS_LIMIT
    ) -> List[Dict[str, Any]]:
        """
        Get K events closest in time to target_time (before and after).

        Used by PERSONALIZE to understand scheduling constraints when inferring
        end times for events that have no explicit duration.

        Args:
            user_id: User's UUID
            target_time: ISO 8601 datetime (e.g., '2026-02-05T14:00:00-05:00')
            k: Total number of surrounding events to return

        Returns:
            List of event dicts sorted by temporal proximity to target_time.
            Each dict contains: summary, start_time, end_time, start_date,
            end_date, is_all_day, location, calendar_name.
        """
        from database.supabase_client import get_supabase
        supabase = get_supabase()

        fields = "summary, start_time, end_time, start_date, end_date, is_all_day, location, calendar_name"
        half_k = max(k, 2)  # fetch more than needed, trim later

        # Events before target_time
        before = supabase.table("events").select(fields)\
            .eq("user_id", user_id)\
            .neq("provider", "dropcal")\
            .is_("deleted_at", None)\
            .not_.is_("start_time", None)\
            .lt("start_time", target_time)\
            .order("start_time", desc=True)\
            .limit(half_k).execute()

        # Events after target_time
        after = supabase.table("events").select(fields)\
            .eq("user_id", user_id)\
            .neq("provider", "dropcal")\
            .is_("deleted_at", None)\
            .not_.is_("start_time", None)\
            .gte("start_time", target_time)\
            .order("start_time", desc=False)\
            .limit(half_k).execute()

        # Merge and sort by absolute distance from target_time
        all_events = (before.data or []) + (after.data or [])

        try:
            target_dt = datetime.fromisoformat(target_time)
            all_events.sort(
                key=lambda e: abs(
                    (datetime.fromisoformat(e['start_time']) - target_dt).total_seconds()
                )
            )
        except (ValueError, TypeError):
            pass

        return all_events[:k]

    @staticmethod
    def search_location_history(
        user_id: str,
        query_location: str,
        limit: int = QueryLimits.LOCATION_SEARCH_RESULTS_LIMIT
    ) -> List[Dict[str, Any]]:
        """
        Find locations from the user's event history similar to query_location.

        Uses fuzzy string matching (difflib.SequenceMatcher) against distinct
        locations from the user's calendar history. Returns matches with
        frequency counts and context.

        Args:
            user_id: User's UUID
            query_location: Location string to match against
            limit: Max number of results to return

        Returns:
            List of dicts sorted by match score:
            [{'location': str, 'match_score': float, 'count': int,
              'last_used_with': str, 'calendar': str}]
        """
        from database.supabase_client import get_supabase
        from difflib import SequenceMatcher
        from collections import defaultdict

        supabase = get_supabase()

        # Fetch events with non-null locations
        response = supabase.table("events")\
            .select("location, summary, calendar_name, start_time")\
            .eq("user_id", user_id)\
            .neq("provider", "dropcal")\
            .is_("deleted_at", None)\
            .not_.is_("location", None)\
            .order("start_time", desc=True)\
            .limit(QueryLimits.LOCATION_HISTORY_FETCH_LIMIT).execute()

        if not response.data:
            return []

        # Group by location (case-insensitive), track count and most recent usage
        location_data = defaultdict(lambda: {
            'count': 0,
            'canonical': '',
            'last_used_with': '',
            'calendar': ''
        })

        for event in response.data:
            loc = event['location']
            key = loc.lower().strip()
            data = location_data[key]
            data['count'] += 1
            # Keep the most recent occurrence's details (results are ordered desc)
            if not data['canonical']:
                data['canonical'] = loc
                data['last_used_with'] = event.get('summary', '')
                data['calendar'] = event.get('calendar_name', '')

        # Score each unique location against query
        query_lower = query_location.lower().strip()
        results = []
        for key, data in location_data.items():
            score = SequenceMatcher(None, query_lower, key).ratio()
            if score >= 0.3:
                results.append({
                    'location': data['canonical'],
                    'match_score': round(score, 2),
                    'count': data['count'],
                    'last_used_with': data['last_used_with'],
                    'calendar': data['calendar'],
                })

        # Sort by score descending, then by count descending
        results.sort(key=lambda r: (-r['match_score'], -r['count']))
        return results[:limit]

    @staticmethod
    def find_similar_events(
        user_id: str,
        query_text: str,
        limit: int = QueryLimits.DEFAULT_SIMILAR_EVENTS_LIMIT
    ) -> List[Dict[str, Any]]:
        """
        Find similar events using semantic search.

        Args:
            user_id: User's UUID
            query_text: Text to find similar events for
            limit: Number of results

        Returns:
            List of similar events
        """
        # Compute query embedding
        query_embedding = compute_embedding(query_text).tolist()

        # Search using vector similarity
        return Event.find_similar_events(user_id, query_embedding, limit)

    @staticmethod
    def confirm_draft(
        event_id: str,
        user_edits: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        User confirms a draft event, optionally with edits.

        Args:
            event_id: Event UUID
            user_edits: User modifications (optional)

        Returns:
            Updated event
        """
        return Event.confirm_draft(event_id, user_edits)

    @staticmethod
    def event_row_to_calendar_event(event_row: Dict[str, Any], calendars_lookup: Optional[Dict] = None, primary_calendar: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Convert an events table row to frontend CalendarEvent format.

        Maps flat DB columns (start_time, timezone, etc.) to the Google Calendar
        API shape the frontend expects ({start: {dateTime, timeZone}, ...}).

        Args:
            event_row: Dict from events table
            calendars_lookup: Optional dict mapping provider_cal_id → {name, color}
            primary_calendar: Optional dict {name, color} for the primary calendar

        Returns:
            Dict in CalendarEvent format with metadata fields
        """
        tz = event_row.get('timezone') or 'America/New_York'

        if event_row.get('is_all_day'):
            start = {'date': event_row.get('start_date'), 'timeZone': tz}
            end = {'date': event_row.get('end_date'), 'timeZone': tz}
        else:
            start = {'dateTime': event_row.get('start_time'), 'timeZone': tz}
            end = {'dateTime': event_row.get('end_time'), 'timeZone': tz}

        result = {
            'id': event_row['id'],
            'summary': event_row.get('summary', ''),
            'start': start,
            'end': end,
            'version': event_row.get('version', 1),
            'provider_syncs': event_row.get('provider_syncs', []),
        }

        # Optional fields
        if event_row.get('location'):
            result['location'] = event_row['location']
        if event_row.get('description'):
            result['description'] = event_row['description']
        if event_row.get('calendar_name'):
            result['calendar'] = event_row['calendar_name']  # DB column stores provider calendar ID
            if calendars_lookup:
                cal_info = calendars_lookup.get(event_row['calendar_name'])
                if cal_info:
                    result['calendarName'] = cal_info['name']
                    result['calendarColor'] = cal_info['color']
        else:
            if primary_calendar:
                result['calendarName'] = primary_calendar['name']
                result['calendarColor'] = primary_calendar['color']

        # Recurrence and attendees: read from top-level columns first,
        # fall back to system_suggestion for events created before migration
        system_suggestion = event_row.get('system_suggestion') or {}
        recurrence = event_row.get('recurrence') or system_suggestion.get('recurrence')
        attendees = event_row.get('attendees') or system_suggestion.get('attendees')
        if recurrence:
            result['recurrence'] = recurrence
        if attendees:
            result['attendees'] = attendees

        return result

    @staticmethod
    def get_events_by_session(session_id: str, event_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Get all events for a session from the events table, formatted as CalendarEvents.

        Args:
            session_id: Session UUID
            event_ids: Pre-fetched event IDs (avoids redundant session lookup)

        Returns:
            List of CalendarEvent dicts sorted by start time
        """
        if event_ids is None:
            session = Session.get_by_id(session_id)
            if not session:
                return []
            event_ids = session.get('event_ids') or []

        if not event_ids:
            return []

        event_rows = Event.get_by_ids(event_ids)

        # Build calendar lookup for enrichment (one query for all events)
        calendars_lookup = {}
        primary_calendar = None
        if event_rows:
            user_id = event_rows[0].get('user_id')
            if user_id:
                try:
                    from database.models import Calendar
                    cals = Calendar.get_by_user(user_id)
                    for cal in cals:
                        cal_id = cal.get('provider_cal_id')
                        if cal_id:
                            info = {
                                'name': cal.get('name', cal_id),
                                'color': cal.get('color', '#1170C5'),
                            }
                            calendars_lookup[cal_id] = info
                            if cal.get('is_primary'):
                                primary_calendar = info
                except Exception:
                    pass  # Non-critical — events still render with frontend fallback

        events = [
            EventService.event_row_to_calendar_event(row, calendars_lookup, primary_calendar)
            for row in event_rows
        ]

        # Sort by start dateTime or date
        def sort_key(e):
            start = e.get('start', {})
            return start.get('dateTime') or start.get('date') or ''

        events.sort(key=sort_key)
        return events

    @staticmethod
    def sync_to_provider(
        event_id: str,
        provider: str,
        provider_event_id: str,
        calendar_id: str
    ) -> Dict[str, Any]:
        """
        Record that an event was synced to a calendar provider.

        Appends/upserts a sync entry in provider_syncs with the current version.
        The event stays provider='dropcal' — provider_syncs tracks where it's been pushed.

        Args:
            event_id: Event UUID
            provider: Provider name ('google', 'microsoft', 'apple')
            provider_event_id: Provider's event ID (e.g. Google Calendar event ID)
            calendar_id: Provider calendar ID (e.g. 'primary')

        Returns:
            Updated event
        """
        event = Event.get_by_id(event_id)
        if not event:
            raise ValueError(f"Event {event_id} not found")

        syncs = list(event.get('provider_syncs') or [])

        entry = {
            'provider': provider,
            'provider_event_id': provider_event_id,
            'calendar_id': calendar_id,
            'synced_at': datetime.utcnow().isoformat(),
            'synced_version': event.get('version', 1)
        }

        # Upsert: replace existing entry for this provider, or append
        replaced = False
        for i, s in enumerate(syncs):
            if s.get('provider') == provider:
                syncs[i] = entry
                replaced = True
                break
        if not replaced:
            syncs.append(entry)

        return Event.update(event_id, {'provider_syncs': syncs})

    @staticmethod
    def get_conflicting_events(
        user_id: str,
        start_time: str,
        end_time: str
    ) -> List[Dict[str, Any]]:
        """
        Get events that conflict with given time range.

        Args:
            user_id: User's UUID
            start_time: Start ISO timestamp
            end_time: End ISO timestamp

        Returns:
            List of conflicting events
        """
        return Event.get_conflicting_events(user_id, start_time, end_time)

    @staticmethod
    def get_user_corrections(user_id: str) -> List[Dict[str, Any]]:
        """
        Get events where user modified PERSONALIZE suggestions (for feedback loop).

        Args:
            user_id: User's UUID

        Returns:
            List of corrected events
        """
        from database.supabase_client import get_supabase
        supabase = get_supabase()

        response = supabase.table("events").select("*")\
            .eq("user_id", user_id)\
            .eq("provider", "dropcal")\
            .eq("user_modified", True)\
            .is_("deleted_at", None)\
            .order("created_at", desc=True).execute()

        return response.data

    @staticmethod
    def compute_missing_embeddings(batch_size: int = QueryLimits.EMBEDDING_BATCH_SIZE) -> int:
        """
        Background job: Compute embeddings for events that don't have them.

        Args:
            batch_size: Number of events to process per run

        Returns:
            Number of embeddings computed
        """
        from database.supabase_client import get_supabase
        supabase = get_supabase()

        # Get events without embeddings
        response = supabase.table("events").select("id, summary, description")\
            .is_("event_embedding", None)\
            .is_("deleted_at", None)\
            .limit(batch_size).execute()

        events = response.data
        count = 0

        for event in events:
            try:
                # Compute embedding
                text = event['summary']
                if event.get('description'):
                    text += f" {event['description']}"

                embedding = compute_embedding(text).tolist()

                # Update event
                Event.update(event['id'], {
                    "event_embedding": embedding
                })

                count += 1
            except Exception as e:
                print(f"Error computing embedding for event {event['id']}: {e}")
                continue

        return count
