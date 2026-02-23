"""
Microsoft Calendar event creation.
Creates events in Microsoft Calendar from universal format.
"""

from typing import Dict, Any, List, Tuple, Optional
import requests

from . import auth, fetch, transform
from database.models import Session, Event
from pipeline.events import EventService


def create_event(
    user_id: str,
    event_data: Dict[str, Any],
    calendar_id: str = 'primary'
) -> Optional[Dict[str, Any]]:
    """
    Create a single event in Microsoft Calendar.

    Args:
        user_id: User's UUID
        event_data: Event dict in universal (Google Calendar) format
        calendar_id: Calendar ID (default 'primary')

    Returns:
        Created event in universal format, or None if creation failed

    Raises:
        ValueError: If user not authenticated or API call fails
    """
    # Load credentials
    credentials = auth.load_credentials(user_id)
    if not credentials:
        raise ValueError(f"User {user_id} not authenticated with Microsoft Calendar")

    # Refresh if needed
    if not auth.refresh_if_needed(user_id, credentials):
        raise ValueError(f"Failed to refresh Microsoft Calendar credentials for user {user_id}")

    # Reload credentials after potential refresh
    credentials = auth.load_credentials(user_id)
    access_token = credentials['access_token']

    # Convert to Microsoft Graph format
    ms_event = transform.from_universal(event_data)

    # Microsoft Graph API endpoint for creating events
    url = 'https://graph.microsoft.com/v1.0/me/events'

    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    try:
        response = requests.post(url, headers=headers, json=ms_event)
        response.raise_for_status()
        created_event = response.json()

        # Convert back to universal format
        return transform.to_universal(created_event)

    except requests.exceptions.RequestException as e:
        print(f"Failed to create Microsoft Calendar event: {str(e)}")
        return None


def update_event(
    user_id: str,
    provider_event_id: str,
    event_data: Dict[str, Any],
    calendar_id: str = 'primary'
) -> Optional[Dict[str, Any]]:
    """
    Update an existing event in Microsoft Calendar.

    Args:
        user_id: User's UUID
        provider_event_id: Microsoft Calendar event ID to update
        event_data: Updated event data in universal format
        calendar_id: Calendar ID (default 'primary')

    Returns:
        Updated event in universal format, or None if failed
    """
    credentials = auth.load_credentials(user_id)
    if not credentials:
        raise ValueError(f"User {user_id} not authenticated with Microsoft Calendar")

    if not auth.refresh_if_needed(user_id, credentials):
        raise ValueError(f"Failed to refresh Microsoft Calendar credentials for user {user_id}")

    credentials = auth.load_credentials(user_id)
    access_token = credentials['access_token']

    ms_event = transform.from_universal(event_data)

    url = f'https://graph.microsoft.com/v1.0/me/events/{provider_event_id}'

    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    try:
        response = requests.patch(url, headers=headers, json=ms_event)
        response.raise_for_status()
        updated_event = response.json()

        return transform.to_universal(updated_event)

    except requests.exceptions.RequestException as e:
        print(f"Failed to update Microsoft Calendar event: {str(e)}")
        return None


def create_events_from_session(
    user_id: str,
    session_id: str,
    calendar_id: str = 'primary',
    event_ids: Optional[List[str]] = None
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Create Microsoft Calendar events from a session's events.

    Reads from events table (via session.event_ids), falls back to processed_events.
    Records sync in provider_syncs after creation.

    Args:
        event_ids: Optional list of specific event IDs to create (omit for all)
    """
    session = Session.get_by_id(session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")

    if not auth.is_authenticated(user_id):
        raise ValueError(f"User {user_id} not authenticated with Microsoft Calendar")

    # Build event tuples: (event_data_for_api, dropcal_event_id)
    event_tuples = []
    session_event_ids = session.get('event_ids') or []

    # If caller specified a subset, filter to only those
    if event_ids is not None:
        session_event_set = set(session_event_ids)
        invalid = [eid for eid in event_ids if eid not in session_event_set]
        if invalid:
            raise ValueError(f"Event IDs not in session: {invalid}")
        target_ids = event_ids
    else:
        target_ids = session_event_ids

    if target_ids:
        for eid in target_ids:
            event_row = Event.get_by_id(eid)
            if event_row and not event_row.get('deleted_at'):
                cal_event = EventService.event_row_to_calendar_event(event_row)
                api_event = {k: v for k, v in cal_event.items()
                             if k not in ('id', 'version', 'provider_syncs')}
                event_tuples.append((api_event, eid))
    else:
        events = session.get('processed_events') or []
        if not events:
            raise ValueError(f"No events found for session {session_id}")
        for event in events:
            event_tuples.append((event, None))

    calendar_event_ids = []
    all_conflicts = []

    for event_data, dropcal_event_id in event_tuples:
        start_time = event_data.get('start', {}).get('dateTime')
        end_time = event_data.get('end', {}).get('dateTime')

        if start_time and end_time:
            try:
                conflicts = fetch.check_conflicts(
                    user_id=user_id, start_time=start_time,
                    end_time=end_time, calendar_id=calendar_id
                )
                if conflicts:
                    all_conflicts.append({
                        'proposed_event': event_data,
                        'conflicting_events': conflicts
                    })
                    continue
            except Exception as e:
                print(f"Error checking conflicts for event: {e}")

        try:
            created_event = create_event(user_id=user_id, event_data=event_data, calendar_id=calendar_id)

            if created_event and created_event.get('id'):
                calendar_event_ids.append(created_event['id'])
                if dropcal_event_id:
                    EventService.sync_to_provider(
                        event_id=dropcal_event_id,
                        provider='microsoft',
                        provider_event_id=created_event['id'],
                        calendar_id=calendar_id
                    )
            else:
                print(f"Failed to create event: {event_data.get('summary')}")

        except Exception as e:
            print(f"Error creating event {event_data.get('summary')}: {e}")
            continue

    return calendar_event_ids, all_conflicts
