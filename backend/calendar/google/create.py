"""
Google Calendar event creation.
Accepts events in universal format (Google Calendar JSON).
"""

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from typing import Dict, Optional, List, Tuple

from database.models import Session as DBSession
from calendar.google import auth, fetch


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


def create_events_from_session(
    user_id: str,
    session_id: str,
    calendar_id: str = 'primary'
) -> Tuple[List[str], List[Dict]]:
    """
    Create calendar events from a session's processed_events.

    Args:
        user_id: User's UUID
        session_id: Session UUID
        calendar_id: Target calendar ID (default: 'primary')

    Returns:
        Tuple of (calendar_event_ids, conflicts)
        - calendar_event_ids: List of created event IDs
        - conflicts: List of detected conflicts with details

    Raises:
        ValueError: If session not found or no processed events
        PermissionError: If session doesn't belong to user
        Exception: If event creation fails
    """
    # Get session
    session = DBSession.get_by_id(session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")

    # Verify session belongs to user
    if session.get('user_id') != user_id:
        raise PermissionError("Session does not belong to user")

    # Get processed events
    processed_events = session.get('processed_events', [])
    if not processed_events:
        raise ValueError("No processed events in session")

    calendar_event_ids = []
    all_conflicts = []

    for event in processed_events:
        # Check for conflicts first
        start_time = event.get('start', {}).get('dateTime')
        end_time = event.get('end', {}).get('dateTime')

        if start_time and end_time:
            conflicts = fetch.check_conflicts(user_id, start_time, end_time, calendar_id)

            if conflicts:
                all_conflicts.append({
                    'event_summary': event.get('summary'),
                    'proposed_start': start_time,
                    'proposed_end': end_time,
                    'conflicts': conflicts
                })

        # Create event regardless of conflicts (user can decide what to do)
        created_event = create_event(user_id, event, calendar_id)

        if created_event:
            calendar_event_ids.append(created_event['id'])
        else:
            # Failed to create event
            raise Exception(f"Failed to create event: {event.get('summary')}")

    # Update session with calendar event IDs
    DBSession.mark_added_to_calendar(session_id, calendar_event_ids)

    # Also store conflicts in session
    if all_conflicts:
        DBSession.update_events(session_id, conflicts=all_conflicts)

    return calendar_event_ids, all_conflicts
