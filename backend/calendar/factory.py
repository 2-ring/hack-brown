"""
Calendar provider factory.

Routes calendar operations to the correct provider based on user's primary provider.
Provides a unified interface for calendar operations across all providers.
"""

from typing import Dict, List, Optional, Tuple
from database.models import User


def get_provider_modules(provider: str) -> tuple:
    """
    Get auth, fetch, and create modules for a provider.

    Args:
        provider: Provider name ('google', 'microsoft', 'apple')

    Returns:
        Tuple of (auth_module, fetch_module, create_module)

    Raises:
        ValueError: If provider is not supported
    """
    if provider == 'google':
        from calendar.google import auth, fetch, create
        return auth, fetch, create
    elif provider == 'microsoft':
        from calendar.microsoft import auth, fetch, create
        return auth, fetch, create
    elif provider == 'apple':
        from calendar.apple import auth, fetch, create
        return auth, fetch, create
    else:
        raise ValueError(f"Unsupported calendar provider: {provider}")


def get_user_primary_provider(user_id: str) -> str:
    """
    Get user's primary calendar provider.

    Args:
        user_id: User's UUID

    Returns:
        Provider name ('google', 'microsoft', 'apple')

    Raises:
        ValueError: If user not found or no primary provider set
    """
    user = User.get_by_id(user_id)

    if not user:
        raise ValueError(f"User {user_id} not found")

    primary_provider = user.get('primary_calendar_provider')

    if not primary_provider:
        # Default to Google if no primary set (backward compatibility)
        primary_provider = 'google'

    return primary_provider


# Convenience functions that auto-route to primary provider

def is_authenticated(user_id: str, provider: Optional[str] = None) -> bool:
    """
    Check if user is authenticated with a calendar provider.

    Args:
        user_id: User's UUID
        provider: Provider to check, or None to use primary

    Returns:
        True if authenticated
    """
    if not provider:
        provider = get_user_primary_provider(user_id)

    auth_module, _, _ = get_provider_modules(provider)
    return auth_module.is_authenticated(user_id)


def list_events(
    user_id: str,
    max_results: int = 100,
    time_min: Optional[str] = None,
    provider: Optional[str] = None
) -> List[Dict]:
    """
    List events from user's calendar.

    Args:
        user_id: User's UUID
        max_results: Maximum number of events to return
        time_min: Lower bound for event start time (ISO format)
        provider: Provider to use, or None to use primary

    Returns:
        List of events in universal format
    """
    if not provider:
        provider = get_user_primary_provider(user_id)

    _, fetch_module, _ = get_provider_modules(provider)
    return fetch_module.list_events(user_id, max_results, time_min)


def check_conflicts(
    user_id: str,
    start_time: str,
    end_time: str,
    provider: Optional[str] = None
) -> List[Dict]:
    """
    Check for scheduling conflicts.

    Args:
        user_id: User's UUID
        start_time: ISO format datetime
        end_time: ISO format datetime
        provider: Provider to use, or None to use primary

    Returns:
        List of busy time periods
    """
    if not provider:
        provider = get_user_primary_provider(user_id)

    _, fetch_module, _ = get_provider_modules(provider)
    return fetch_module.check_conflicts(user_id, start_time, end_time)


def create_event(
    user_id: str,
    event_data: Dict,
    calendar_id: str = 'primary',
    provider: Optional[str] = None
) -> Optional[Dict]:
    """
    Create a single event.

    Args:
        user_id: User's UUID
        event_data: Event in universal format
        calendar_id: Target calendar ID
        provider: Provider to use, or None to use primary

    Returns:
        Created event data
    """
    if not provider:
        provider = get_user_primary_provider(user_id)

    _, _, create_module = get_provider_modules(provider)
    return create_module.create_event(user_id, event_data, calendar_id)


def create_events_from_session(
    user_id: str,
    session_id: str,
    calendar_id: str = 'primary',
    provider: Optional[str] = None
) -> Tuple[List[str], List[Dict]]:
    """
    Create calendar events from a session's processed_events.

    Args:
        user_id: User's UUID
        session_id: Session UUID
        calendar_id: Target calendar ID
        provider: Provider to use, or None to use primary

    Returns:
        Tuple of (calendar_event_ids, conflicts)
    """
    if not provider:
        provider = get_user_primary_provider(user_id)

    _, _, create_module = get_provider_modules(provider)
    return create_module.create_events_from_session(user_id, session_id, calendar_id)
