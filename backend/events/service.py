"""
Event Service - Manages unified event storage and operations.
Handles both DropCal-created events and provider-synced events.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
import numpy as np

from database.models import Event, Session
from preferences.similarity import compute_embedding
from config.database import QueryLimits


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
        system_suggestion: Optional[Dict] = None
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
            calendar_name: Calendar name
            color_id: Color ID
            original_input: Original raw text input
            extracted_facts: Agent 2 output
            system_suggestion: Agent 5 output

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
            event_embedding=event_embedding
        )

        # Link to session
        Session.add_event(session_id, event['id'])

        return event

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
            calendar_name: Calendar name
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
    def event_row_to_calendar_event(event_row: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert an events table row to frontend CalendarEvent format.

        Maps flat DB columns (start_time, timezone, etc.) to the Google Calendar
        API shape the frontend expects ({start: {dateTime, timeZone}, ...}).

        Args:
            event_row: Dict from events table

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
            result['calendar'] = event_row['calendar_name']

        # Recurrence and attendees are not stored as flat columns —
        # pull from system_suggestion (the original Agent 3 output)
        system_suggestion = event_row.get('system_suggestion') or {}
        if system_suggestion.get('recurrence'):
            result['recurrence'] = system_suggestion['recurrence']
        if system_suggestion.get('attendees'):
            result['attendees'] = system_suggestion['attendees']

        return result

    @staticmethod
    def get_events_by_session(session_id: str) -> List[Dict[str, Any]]:
        """
        Get all events for a session from the events table, formatted as CalendarEvents.

        Args:
            session_id: Session UUID

        Returns:
            List of CalendarEvent dicts sorted by start time
        """
        session = Session.get_by_id(session_id)
        if not session:
            return []

        event_ids = session.get('event_ids') or []
        if not event_ids:
            return []

        events = []
        for event_id in event_ids:
            event_row = Event.get_by_id(event_id)
            if event_row and not event_row.get('deleted_at'):
                events.append(EventService.event_row_to_calendar_event(event_row))

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
        Get events where user modified Agent 5 suggestions (for feedback loop).

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
