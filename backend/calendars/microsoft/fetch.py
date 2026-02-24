"""
Microsoft Calendar event fetching and conflict detection.
Uses Microsoft Graph API to retrieve events in universal format.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import requests

from . import auth, transform


def get_mailbox_timezone(user_id: str) -> Optional[str]:
    """
    Fetch user's timezone from Microsoft mailbox settings.

    Args:
        user_id: User's UUID

    Returns:
        IANA timezone string (e.g. "America/New_York") or None if error
    """
    credentials = auth.load_credentials(user_id)
    if not credentials:
        return None

    if not auth.refresh_if_needed(user_id, credentials):
        return None

    credentials = auth.load_credentials(user_id)
    access_token = credentials['access_token']

    try:
        response = requests.get(
            'https://graph.microsoft.com/v1.0/me/mailboxSettings',
            headers={'Authorization': f'Bearer {access_token}'}
        )
        response.raise_for_status()
        data = response.json()
        return data.get('timeZone')
    except Exception as e:
        print(f"Warning: Could not fetch Microsoft mailbox timezone: {e}")
        return None


def list_events(
    user_id: str,
    max_results: int = 100,
    time_min: Optional[str] = None,
    calendar_id: str = 'primary'
) -> List[Dict[str, Any]]:
    """
    Fetch events from Microsoft Calendar in universal format.

    Args:
        user_id: User's UUID
        max_results: Maximum number of events to return (default 100)
        time_min: ISO format datetime to filter events (optional)
        calendar_id: Calendar ID (default 'primary' which uses the user's default calendar)

    Returns:
        List of events in universal (Google Calendar) format

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

    # Prepare API request
    # Microsoft Graph API endpoint for calendar events
    url = 'https://graph.microsoft.com/v1.0/me/events'

    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    # Build query parameters
    params = {
        '$top': min(max_results, 1000),  # Microsoft limits to 1000
        '$orderby': 'start/dateTime'
    }

    # Add time filter if specified
    if time_min:
        # Microsoft uses $filter with ge (greater than or equal)
        params['$filter'] = f"start/dateTime ge '{time_min}'"

    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()

        events = data.get('value', [])

        # Convert to universal format
        universal_events = []
        for event in events:
            try:
                universal_event = transform.to_universal(event)
                universal_events.append(universal_event)
            except Exception as e:
                print(f"Error converting Microsoft event to universal format: {e}")
                continue

        return universal_events

    except requests.exceptions.RequestException as e:
        raise ValueError(f"Failed to fetch Microsoft Calendar events: {str(e)}")


def get_event(
    user_id: str,
    provider_event_id: str,
    calendar_id: str = 'primary'
) -> Optional[Dict[str, Any]]:
    """
    Fetch a single event from Microsoft Calendar by its event ID.

    Args:
        user_id: User's UUID
        provider_event_id: Microsoft Graph event ID
        calendar_id: Calendar ID (unused — Microsoft event IDs are globally unique)

    Returns:
        Event dict in universal format, or None if not found/deleted
    """
    credentials = auth.load_credentials(user_id)
    if not credentials:
        raise ValueError(f"User {user_id} not authenticated with Microsoft Calendar")

    if not auth.refresh_if_needed(user_id, credentials):
        raise ValueError(f"Failed to refresh Microsoft Calendar credentials for user {user_id}")

    credentials = auth.load_credentials(user_id)
    access_token = credentials['access_token']

    url = f'https://graph.microsoft.com/v1.0/me/events/{provider_event_id}'
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    try:
        response = requests.get(url, headers=headers)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        ms_event = response.json()

        if ms_event.get('isCancelled'):
            return None

        return transform.to_universal(ms_event)

    except requests.exceptions.RequestException as e:
        print(f"Error fetching Microsoft Calendar event {provider_event_id}: {e}")
        return None


def check_conflicts(
    user_id: str,
    start_time: str,
    end_time: str,
    calendar_id: str = 'primary'
) -> List[Dict[str, Any]]:
    """
    Check for scheduling conflicts in Microsoft Calendar.

    Args:
        user_id: User's UUID
        start_time: ISO format start datetime
        end_time: ISO format end datetime
        calendar_id: Calendar ID (default 'primary')

    Returns:
        List of conflicting events in universal format

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

    # Microsoft Graph API calendarView endpoint (better for conflict checking)
    url = 'https://graph.microsoft.com/v1.0/me/calendarview'

    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
        'Prefer': 'outlook.timezone="UTC"'
    }

    # calendarView requires startDateTime and endDateTime as query params
    params = {
        'startDateTime': start_time,
        'endDateTime': end_time
    }

    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()

        events = data.get('value', [])

        # Convert to universal format
        conflicts = []
        for event in events:
            try:
                # Skip cancelled events
                if event.get('isCancelled'):
                    continue

                universal_event = transform.to_universal(event)
                conflicts.append(universal_event)
            except Exception as e:
                print(f"Error converting Microsoft event to universal format: {e}")
                continue

        return conflicts

    except requests.exceptions.RequestException as e:
        raise ValueError(f"Failed to check Microsoft Calendar conflicts: {str(e)}")
