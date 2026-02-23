"""
Google Calendar event creation.
Accepts events in universal format (Google Calendar JSON).
"""

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from typing import Dict, Optional, List, Tuple

from database.models import Session as DBSession, Event
from pipeline.events import EventService
from . import auth, fetch


def create_event(
    user_id: str,
    event_data: Dict,
    calendar_id: str = 'primary'
) -> Optional[Dict]:
    """
    Create a single event in Google Calendar.

    Args:
        user_id: User's UUID
        event_data: Event data in universal format (Google Calendar API format)
        calendar_id: Target calendar ID (default: 'primary')

    Returns:
        Created event data with 'id', 'htmlLink', etc., or None if failed

    Raises:
        Exception: If not authenticated
    """
    credentials = auth.load_credentials(user_id)

    if not credentials:
        raise Exception("Not authenticated with Google Calendar")

    if not auth.refresh_if_needed(user_id, credentials):
        raise Exception("Failed to refresh Google Calendar credentials")

    try:
        service = build('calendar', 'v3', credentials=credentials)

        event = service.events().insert(
            calendarId=calendar_id,
            body=event_data
        ).execute()

        return event

    except HttpError as error:
        print(f"Error creating Google Calendar event: {error}")
        return None


def update_event(
    user_id: str,
    provider_event_id: str,
    event_data: Dict,
    calendar_id: str = 'primary'
) -> Optional[Dict]:
    """
    Update an existing event in Google Calendar.

    Args:
        user_id: User's UUID
        provider_event_id: Google Calendar event ID to update
        event_data: Updated event data in universal format
        calendar_id: Target calendar ID (default: 'primary')

    Returns:
        Updated event data, or None if failed
    """
    credentials = auth.load_credentials(user_id)

    if not credentials:
        raise Exception("Not authenticated with Google Calendar")

    if not auth.refresh_if_needed(user_id, credentials):
        raise Exception("Failed to refresh Google Calendar credentials")

    try:
        service = build('calendar', 'v3', credentials=credentials)

        event = service.events().patch(
            calendarId=calendar_id,
            eventId=provider_event_id,
            body=event_data
        ).execute()

        return event

    except HttpError as error:
        print(f"Error updating Google Calendar event: {error}")
        return None


def create_events_from_session(
    user_id: str,
    session_id: str,
    calendar_id: str = 'primary',
    event_ids: Optional[List[str]] = None
) -> Tuple[List[str], List[Dict]]:
    """
    Create Google Calendar events from a session's events.

    Reads events from the events table (via session.event_ids). After creating
    each event in Google Calendar, records the sync in provider_syncs.
    Falls back to session.processed_events for old sessions.

    Args:
        user_id: User's UUID
        session_id: Session UUID
        calendar_id: Target calendar ID (default: 'primary')
        event_ids: Optional list of specific event IDs to create (omit for all)

    Returns:
        Tuple of (calendar_event_ids, conflicts)

    Raises:
        ValueError: If session not found or no events
        PermissionError: If session doesn't belong to user
    """
    session = DBSession.get_by_id(session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")
    if session.get('user_id') != user_id:
        raise PermissionError("Session does not belong to user")

    # Build list of (event_data_for_api, dropcal_event_id) tuples
    event_tuples = []
    session_event_ids = session.get('event_ids') or []

    # If caller specified a subset, filter to only those (and validate they belong to this session)
    if event_ids is not None:
        session_event_set = set(session_event_ids)
        invalid = [eid for eid in event_ids if eid not in session_event_set]
        if invalid:
            raise ValueError(f"Event IDs not in session: {invalid}")
        target_ids = event_ids
    else:
        target_ids = session_event_ids

    if target_ids:
        # New path: read from events table
        for eid in target_ids:
            event_row = Event.get_by_id(eid)
            if event_row and not event_row.get('deleted_at'):
                cal_event = EventService.event_row_to_calendar_event(event_row)
                # Strip metadata fields before sending to Google API
                api_event = {k: v for k, v in cal_event.items()
                             if k not in ('id', 'version', 'provider_syncs', 'calendar')}
                event_tuples.append((api_event, eid))
    else:
        # Backward compat: fall back to processed_events blob
        processed_events = session.get('processed_events') or []
        if not processed_events:
            raise ValueError("No events found for session")
        for event in processed_events:
            event_tuples.append((event, None))

    if not event_tuples:
        raise ValueError("No events found for session")

    calendar_event_ids = []
    all_conflicts = []

    for event_data, dropcal_event_id in event_tuples:
        # Check for conflicts
        start_time = event_data.get('start', {}).get('dateTime')
        end_time = event_data.get('end', {}).get('dateTime')

        if start_time and end_time:
            conflicts = fetch.check_conflicts(user_id, start_time, end_time, calendar_id)
            if conflicts:
                all_conflicts.append({
                    'event_summary': event_data.get('summary'),
                    'proposed_start': start_time,
                    'proposed_end': end_time,
                    'conflicts': conflicts
                })

        # Create event regardless of conflicts
        created_event = create_event(user_id, event_data, calendar_id)

        if created_event:
            calendar_event_ids.append(created_event['id'])
            # Record sync in provider_syncs
            if dropcal_event_id:
                EventService.sync_to_provider(
                    event_id=dropcal_event_id,
                    provider='google',
                    provider_event_id=created_event['id'],
                    calendar_id=calendar_id
                )
        else:
            raise Exception(f"Failed to create event: {event_data.get('summary')}")

    # Update session
    DBSession.mark_added_to_calendar(session_id, calendar_event_ids)
    if all_conflicts:
        DBSession.update_events(session_id, conflicts=all_conflicts)

    return calendar_event_ids, all_conflicts
