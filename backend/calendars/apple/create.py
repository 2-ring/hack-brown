"""
Apple Calendar event creation.
Creates events in Apple Calendar from universal format using CalDAV.
"""

from typing import Dict, Any, List, Tuple, Optional
import uuid

from . import auth, fetch, transform
from database.models import Session, Event
from pipeline.events import EventService


def create_event(
    user_id: str,
    event_data: Dict[str, Any],
    calendar_id: str = 'primary'
) -> Optional[Dict[str, Any]]:
    """
    Create a single event in Apple Calendar.

    Generates a stable UUID as the iCal UID so the event can be updated later.

    Args:
        user_id: User's UUID
        event_data: Event dict in universal (Google Calendar) format
        calendar_id: Calendar ID (default 'primary')

    Returns:
        Created event with 'id' set to the iCal UID, or None if failed

    Raises:
        ValueError: If user not authenticated or CalDAV operation fails
    """
    client = auth.get_caldav_client(user_id)
    if not client:
        raise ValueError(f"User {user_id} not authenticated with Apple Calendar")

    try:
        calendar = auth.get_default_calendar(client)

        # Generate a stable UID so we can update this event later via CalDAV
        event_uid = str(uuid.uuid4())
        event_data_with_id = {**event_data, 'id': event_uid}

        ical_calendar = transform.from_universal(event_data_with_id)
        ical_string = ical_calendar.to_ical().decode('utf-8')

        calendar.save_event(ical_string)

        # Return with the generated UID as the event ID
        return event_data_with_id

    except Exception as e:
        print(f"Failed to create Apple Calendar event: {str(e)}")
        return None


def update_event(
    user_id: str,
    provider_event_id: str,
    event_data: Dict[str, Any],
    calendar_id: str = 'primary'
) -> Optional[Dict[str, Any]]:
    """
    Update an existing event in Apple Calendar via CalDAV.

    Uses the iCal UID to find and replace the event.
    Falls back to create if the UID is a legacy placeholder (apple-event-N).

    Args:
        user_id: User's UUID
        provider_event_id: iCal UID of the event to update
        event_data: Updated event data in universal format
        calendar_id: Calendar ID (default 'primary')

    Returns:
        Updated event data with id, or None if failed
    """
    # Legacy placeholder IDs can't be updated — fall back to create
    if provider_event_id.startswith('apple-event-'):
        print(f"Legacy Apple event ID '{provider_event_id}', falling back to create")
        return create_event(user_id, event_data, calendar_id)

    client = auth.get_caldav_client(user_id)
    if not client:
        raise ValueError(f"User {user_id} not authenticated with Apple Calendar")

    try:
        calendar = auth.get_default_calendar(client)

        # Inject the existing UID so CalDAV overwrites the event
        event_data_with_id = {**event_data, 'id': provider_event_id}
        ical_calendar = transform.from_universal(event_data_with_id)
        ical_string = ical_calendar.to_ical().decode('utf-8')

        # CalDAV save_event with same UID performs an upsert
        calendar.save_event(ical_string)

        return event_data_with_id

    except Exception as e:
        print(f"Failed to update Apple Calendar event: {str(e)}")
        return None


def create_events_from_session(
    user_id: str,
    session_id: str,
    calendar_id: str = 'primary',
    event_ids: Optional[List[str]] = None
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Create Apple Calendar events from a session's events.

    Reads from events table (via session.event_ids), falls back to processed_events.
    Records sync in provider_syncs after creation.

    Args:
        event_ids: Optional list of specific event IDs to create (omit for all)
    """
    session = Session.get_by_id(session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")

    if not auth.is_authenticated(user_id):
        raise ValueError(f"User {user_id} not authenticated with Apple Calendar")

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

            if created_event:
                provider_event_id = created_event.get('id', f'apple-event-{len(calendar_event_ids)}')
                calendar_event_ids.append(provider_event_id)
                if dropcal_event_id:
                    EventService.sync_to_provider(
                        event_id=dropcal_event_id,
                        provider='apple',
                        provider_event_id=provider_event_id,
                        calendar_id=calendar_id
                    )
            else:
                print(f"Failed to create event: {event_data.get('summary')}")

        except Exception as e:
            print(f"Error creating event {event_data.get('summary')}: {e}")
            continue

    return calendar_event_ids, all_conflicts
