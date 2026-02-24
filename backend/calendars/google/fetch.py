"""
Google Calendar event fetching and conflict detection.
Returns events in universal format (Google Calendar JSON).
"""

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from typing import List, Dict, Optional

from . import auth


def list_events(
    user_id: str,
    max_results: int = 100,
    time_min: str = None,
    calendar_id: str = 'primary'
) -> List[Dict]:
    """
    Fetch events from Google Calendar.

    Args:
        user_id: User's UUID
        max_results: Maximum number of events to return
        time_min: Lower bound for event start time (ISO format), defaults to now
        calendar_id: Calendar to fetch from (default: 'primary')

    Returns:
        List of events in universal format (Google Calendar JSON)

    Raises:
        Exception: If not authenticated or API error
    """
    credentials = auth.load_credentials(user_id)

    if not credentials:
        raise Exception("Not authenticated with Google Calendar")

    if not auth.refresh_if_needed(user_id, credentials):
        raise Exception("Failed to refresh Google Calendar credentials")

    try:
        service = build('calendar', 'v3', credentials=credentials)

        # If no time_min specified, use current time
        if not time_min:
            from datetime import datetime
            time_min = datetime.utcnow().isoformat() + 'Z'

        events_result = service.events().list(
            calendarId=calendar_id,
            maxResults=max_results,
            timeMin=time_min,
            singleEvents=True,
            orderBy='startTime'
        ).execute()

        events = events_result.get('items', [])

        # Already in universal format (Google Calendar JSON)
        return events

    except HttpError as error:
        print(f"Error listing Google Calendar events: {error}")
        return []


def check_conflicts(
    user_id: str,
    start_time: str,
    end_time: str,
    calendar_id: str = 'primary'
) -> List[Dict]:
    """
    Check for scheduling conflicts using Freebusy API.

    Args:
        user_id: User's UUID
        start_time: ISO format datetime
        end_time: ISO format datetime
        calendar_id: Calendar to check (default: 'primary')

    Returns:
        List of busy time periods that conflict

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

        body = {
            "timeMin": start_time,
            "timeMax": end_time,
            "items": [{"id": calendar_id}]
        }

        result = service.freebusy().query(body=body).execute()
        busy_periods = result.get('calendars', {}).get(calendar_id, {}).get('busy', [])

        return busy_periods

    except HttpError as error:
        print(f"Error checking Google Calendar conflicts: {error}")
        return []


def list_calendars(user_id: str) -> List[Dict]:
    """
    List all calendars the user has access to.

    Args:
        user_id: User's UUID

    Returns:
        List of calendar dicts with id, summary, backgroundColor, etc.
    """
    credentials = auth.load_credentials(user_id)

    if not credentials:
        raise Exception("Not authenticated with Google Calendar")

    if not auth.refresh_if_needed(user_id, credentials):
        raise Exception("Failed to refresh Google Calendar credentials")

    try:
        service = build('calendar', 'v3', credentials=credentials)
        calendar_list_result = service.calendarList().list().execute()
        calendars = calendar_list_result.get('items', [])

        # Exclude external/read-only calendars (e.g. public sports schedules)
        # Only include calendars the user can write to
        writable = [c for c in calendars if c.get('accessRole') in ('owner', 'writer')]
        return writable

    except HttpError as error:
        print(f"Error listing Google calendars: {error}")
        return []


def get_event(
    user_id: str,
    provider_event_id: str,
    calendar_id: str = 'primary'
) -> Optional[Dict]:
    """
    Fetch a single event from Google Calendar by its event ID.

    Args:
        user_id: User's UUID
        provider_event_id: Google Calendar event ID
        calendar_id: Calendar to fetch from (default: 'primary')

    Returns:
        Event dict in Google Calendar API format, or None if not found/deleted
    """
    credentials = auth.load_credentials(user_id)

    if not credentials:
        raise Exception("Not authenticated with Google Calendar")

    if not auth.refresh_if_needed(user_id, credentials):
        raise Exception("Failed to refresh Google Calendar credentials")

    try:
        service = build('calendar', 'v3', credentials=credentials)
        event = service.events().get(
            calendarId=calendar_id,
            eventId=provider_event_id
        ).execute()

        if event.get('status') == 'cancelled':
            return None

        return event

    except HttpError as error:
        if error.resp.status == 404:
            return None
        print(f"Error fetching Google Calendar event {provider_event_id}: {error}")
        return None


def get_calendar_settings(user_id: str) -> Optional[Dict]:
    """
    Fetch user's Google Calendar settings including timezone.

    Args:
        user_id: User's UUID

    Returns:
        Dict with timezone and other settings, or None if error

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

        # Fetch timezone setting
        timezone_setting = service.settings().get(setting='timezone').execute()
        timezone = timezone_setting.get('value')

        return {
            'timezone': timezone
        }

    except HttpError as error:
        print(f"Error fetching Google Calendar settings: {error}")
        return None
