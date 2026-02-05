"""
Event Service - Manages unified event storage and operations.
Handles both DropCal-created events and provider-synced events.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
import numpy as np

from database.models import Event, Session
from preferences.similarity import compute_embedding


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
        limit: int = 500
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
        limit: int = 200
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
        limit: int = 10
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
    def sync_to_provider(
        event_id: str,
        provider_event_id: str,
        provider_calendar_id: str
    ) -> Dict[str, Any]:
        """
        Mark event as synced to provider (after creating in Google Calendar).

        Args:
            event_id: Event UUID
            provider_event_id: Google Calendar event ID
            provider_calendar_id: Google Calendar ID

        Returns:
            Updated event
        """
        return Event.update(event_id, {
            "provider": "google",  # Change from dropcal to google
            "provider_event_id": provider_event_id,
            "provider_account_id": provider_calendar_id,
            "last_synced_at": datetime.utcnow().isoformat()
        })

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
    def compute_missing_embeddings(batch_size: int = 100) -> int:
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
