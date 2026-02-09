"""
Calendar provider factory.

Routes calendar operations to the correct provider based on user's primary provider.
Provides a unified interface for calendar operations across all providers.
"""

from typing import Any, Dict, List, Optional, Tuple
from database.models import User, Event, Session as DBSession
from events.service import EventService


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
        from calendars.google import auth, fetch, create
        return auth, fetch, create
    elif provider == 'microsoft':
        from calendars.microsoft import auth, fetch, create
        return auth, fetch, create
    elif provider == 'apple':
        from calendars.apple import auth, fetch, create
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


def list_calendars(
    user_id: str,
    provider: Optional[str] = None
) -> List[Dict]:
    """
    List all calendars the user has access to.

    Args:
        user_id: User's UUID
        provider: Provider to use, or None to use primary

    Returns:
        List of calendar dicts
    """
    if not provider:
        provider = get_user_primary_provider(user_id)

    _, fetch_module, _ = get_provider_modules(provider)
    return fetch_module.list_calendars(user_id)


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
    provider: Optional[str] = None,
    event_ids: Optional[List[str]] = None
) -> Tuple[List[str], List[Dict]]:
    """
    Create calendar events from a session's processed_events.

    Args:
        user_id: User's UUID
        session_id: Session UUID
        calendar_id: Target calendar ID
        provider: Provider to use, or None to use primary
        event_ids: Optional list of specific event IDs to create (omit for all)

    Returns:
        Tuple of (calendar_event_ids, conflicts)
    """
    if not provider:
        provider = get_user_primary_provider(user_id)

    _, _, create_module = get_provider_modules(provider)
    return create_module.create_events_from_session(user_id, session_id, calendar_id, event_ids=event_ids)


def update_event(
    user_id: str,
    provider_event_id: str,
    event_data: Dict,
    calendar_id: str = 'primary',
    provider: Optional[str] = None
) -> Optional[Dict]:
    """
    Update a single event in the external calendar.

    Args:
        user_id: User's UUID
        provider_event_id: Provider's event ID to update
        event_data: Updated event in universal format
        calendar_id: Target calendar ID
        provider: Provider to use, or None to use primary

    Returns:
        Updated event data, or None if failed
    """
    if not provider:
        provider = get_user_primary_provider(user_id)

    _, _, create_module = get_provider_modules(provider)
    return create_module.update_event(user_id, provider_event_id, event_data, calendar_id)


def sync_events_from_session(
    user_id: str,
    session_id: str,
    calendar_id: str = 'primary',
    provider: Optional[str] = None,
    event_ids: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Smart sync: create, update, or skip events based on their sync status.

    For each event in the session:
    - No sync entry for this provider → CREATE in external calendar
    - Sync entry exists, synced_version == current version → SKIP
    - Sync entry exists, synced_version < current version → UPDATE

    Args:
        user_id: User's UUID
        session_id: Session UUID
        calendar_id: Target calendar ID
        provider: Provider to use, or None to use primary
        event_ids: Optional subset of event IDs to sync

    Returns:
        Dict with created, updated, skipped, failed, conflicts lists
        and num_created, num_updated, num_skipped counts
    """
    if not provider:
        provider = get_user_primary_provider(user_id)

    session = DBSession.get_by_id(session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")
    if session.get('user_id') != user_id:
        raise PermissionError("Session does not belong to user")

    _, fetch_module, create_module = get_provider_modules(provider)

    # Determine target event IDs
    session_event_ids = session.get('event_ids') or []
    if event_ids is not None:
        session_event_set = set(session_event_ids)
        invalid = [eid for eid in event_ids if eid not in session_event_set]
        if invalid:
            raise ValueError(f"Event IDs not in session: {invalid}")
        target_ids = event_ids
    else:
        target_ids = session_event_ids

    if not target_ids:
        raise ValueError("No events found for session")

    created = []
    updated = []
    skipped = []
    failed = []
    conflicts = []

    for event_id in target_ids:
        event_row = Event.get_by_id(event_id)
        if not event_row or event_row.get('deleted_at'):
            continue

        cal_event = EventService.event_row_to_calendar_event(event_row)
        api_event = {k: v for k, v in cal_event.items()
                     if k not in ('id', 'version', 'provider_syncs')}

        current_version = event_row.get('version', 1)
        provider_syncs = event_row.get('provider_syncs') or []
        sync_entry = next((s for s in provider_syncs if s.get('provider') == provider), None)

        # Check conflicts
        start_time = api_event.get('start', {}).get('dateTime')
        end_time = api_event.get('end', {}).get('dateTime')
        event_conflicts = []
        if start_time and end_time:
            try:
                event_conflicts = fetch_module.check_conflicts(user_id, start_time, end_time, calendar_id)
            except Exception:
                pass

        if event_conflicts:
            conflicts.append({
                'event_id': event_id,
                'event_summary': api_event.get('summary'),
                'conflicts': event_conflicts
            })

        try:
            if not sync_entry:
                # DRAFT → CREATE
                created_event = create_module.create_event(user_id, api_event, calendar_id)
                if created_event:
                    provider_event_id = created_event.get('id', event_id)
                    EventService.sync_to_provider(event_id, provider, provider_event_id, calendar_id)
                    created.append(event_id)
                else:
                    failed.append(event_id)

            elif sync_entry.get('synced_version') == current_version:
                # UP TO DATE → SKIP
                skipped.append(event_id)

            else:
                # EDITED → UPDATE
                provider_event_id = sync_entry['provider_event_id']
                updated_event = create_module.update_event(
                    user_id, provider_event_id, api_event, calendar_id
                )
                if updated_event:
                    EventService.sync_to_provider(event_id, provider, provider_event_id, calendar_id)
                    updated.append(event_id)
                else:
                    failed.append(event_id)

        except Exception as e:
            print(f"Error syncing event {event_id}: {e}")
            failed.append(event_id)

    # Mark session as added to calendar (only new creates)
    all_synced_ids = created + updated
    if created:
        DBSession.mark_added_to_calendar(session_id, all_synced_ids)

    return {
        'created': created,
        'updated': updated,
        'skipped': skipped,
        'failed': failed,
        'conflicts': conflicts,
        'num_created': len(created),
        'num_updated': len(updated),
        'num_skipped': len(skipped),
    }
