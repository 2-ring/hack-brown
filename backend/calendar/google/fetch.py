"""
Google Calendar event fetching and conflict detection.
Returns events in universal format (Google Calendar JSON).
"""

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from typing import List, Dict

from calendar.google import auth


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
