"""
Smart Sync Service - Intelligent calendar synchronization.
Automatically chooses the best sync strategy based on current state.
"""

from typing import Dict, Optional
from datetime import datetime, timedelta
from database.models import Event, User
from events.service import EventService
from config.calendar import SyncConfig


class SmartSyncService:
    """
    Intelligent sync service that adapts strategy based on:
    - Last sync time
    - Number of existing events
    - Sync token availability
    - Provider capabilities
    """

    def sync(self, user_id: str) -> Dict:
        """
        Single smart sync endpoint.
        Backend decides what to do based on current state.

        Args:
            user_id: User's UUID

        Returns:
            Sync results with metadata about what happened
        """

        # Get current state
        state = self._analyze_sync_state(user_id)

        # Decide strategy
        strategy = self._choose_strategy(state)

        # Execute sync
        results = self._execute_sync(user_id, state, strategy)

        return {
            'success': True,
            'strategy': strategy,
            'synced_at': datetime.utcnow().isoformat(),
            **state,
            **results
        }

    def _analyze_sync_state(self, user_id: str) -> Dict:
        """
        Analyze current sync state to decide what to do.

        Returns:
            {
                'is_first_sync': bool,
                'last_synced_at': str,
                'minutes_since_last_sync': int,
                'total_events_in_db': int,
                'most_recent_event': str,
                'has_sync_token': bool,
                'provider': str,
                'calendar_id': str
            }
        """

        # Get user's primary calendar provider
        user = User.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")

        provider = user.get('primary_calendar_provider', 'google')

        conn = User.get_primary_calendar_connection(user_id)
        if not conn:
            raise ValueError("No calendar provider connected")

        calendar_id = conn.get('email')

        # Get sync state from database
        sync_state = self._get_sync_state(user_id, provider, calendar_id)
        last_synced_at = sync_state.get('last_synced_at')
        has_sync_token = sync_state.get('sync_token') is not None

        # Calculate time since last sync
        minutes_since_last_sync = None
        if last_synced_at:
            last_sync = datetime.fromisoformat(last_synced_at.replace('Z', '+00:00'))
            minutes_since_last_sync = int(
                (datetime.utcnow() - last_sync.replace(tzinfo=None)).total_seconds() / 60
            )

        # Get event statistics
        event_stats = Event.get_user_event_stats(user_id, provider)

        return {
            'is_first_sync': last_synced_at is None,
            'last_synced_at': last_synced_at,
            'minutes_since_last_sync': minutes_since_last_sync,
            'total_events_in_db': event_stats.get('total', 0),
            'most_recent_event': event_stats.get('most_recent'),
            'has_sync_token': has_sync_token,
            'provider': provider,
            'calendar_id': calendar_id
        }

    def _choose_strategy(self, state: Dict) -> str:
        """
        Choose sync strategy based on current state.

        Strategies:
        - 'skip': Too soon since last sync
        - 'incremental': Use sync token (only changes)
        - 'full': Full sync (no token or first time)
        - 'fast_incremental': Quick check for recent changes
        """

        # Skip if synced very recently (avoid hammering API)
        if state['minutes_since_last_sync'] and state['minutes_since_last_sync'] < SyncConfig.SKIP_IF_SYNCED_WITHIN_MINUTES:
            return 'skip'

        # First sync: full sync (last 1 year)
        if state['is_first_sync']:
            return 'full'

        # Have sync token: use incremental sync (most efficient)
        if state['has_sync_token']:
            return 'incremental'

        # No token but synced recently: fast incremental
        if state['minutes_since_last_sync'] and state['minutes_since_last_sync'] < SyncConfig.FAST_INCREMENTAL_THRESHOLD_MINUTES:
            return 'fast_incremental'

        # Default: full sync
        return 'full'

    def _execute_sync(
        self,
        user_id: str,
        state: Dict,
        strategy: str
    ) -> Dict:
        """Execute the chosen sync strategy."""

        if strategy == 'skip':
            return {
                'skipped': True,
                'reason': f'Recently synced ({state["minutes_since_last_sync"]} min ago)',
                'events_added': 0,
                'events_updated': 0,
                'events_deleted': 0
            }

        provider = state['provider']
        calendar_id = state['calendar_id']

        if strategy == 'incremental':
            # Use sync token (most efficient)
            return self._incremental_sync(user_id, provider, calendar_id)

        elif strategy == 'fast_incremental':
            # Quick check for events modified in last hour
            return self._fast_incremental_sync(user_id, provider, calendar_id)

        elif strategy == 'full':
            # Full sync (first time or token expired)
            return self._full_sync(user_id, provider, calendar_id)

        else:
            raise ValueError(f"Unknown strategy: {strategy}")

    def _incremental_sync(
        self,
        user_id: str,
        provider: str,
        calendar_id: str
    ) -> Dict:
        """
        Incremental sync using sync token.
        Only fetches changes since last sync.
        """
        from calendars.google import auth
        from googleapiclient.discovery import build
        from googleapiclient.errors import HttpError

        # Get sync token
        sync_state = self._get_sync_state(user_id, provider, calendar_id)
        sync_token = sync_state.get('sync_token')

        credentials = auth.load_credentials(user_id)
        if not credentials:
            raise ValueError("No credentials found")

        service = build('calendar', 'v3', credentials=credentials)

        results = {'events_added': 0, 'events_updated': 0, 'events_deleted': 0}
        page_token = None
        new_sync_token = None

        while True:
            try:
                response = service.events().list(
                    calendarId=calendar_id,
                    syncToken=sync_token,
                    pageToken=page_token,
                    showDeleted=True
                ).execute()

                # Process events
                for event in response.get('items', []):
                    change = self._process_event(user_id, calendar_id, event)
                    if change:
                        results[f'events_{change}'] += 1

                page_token = response.get('nextPageToken')
                if not page_token:
                    new_sync_token = response.get('nextSyncToken')
                    break

            except HttpError as e:
                if e.resp.status == 410:
                    # Token expired - fallback to full sync
                    print(f"Sync token expired for user {user_id}, falling back to full sync")
                    return self._full_sync(user_id, provider, calendar_id)
                raise

        # Save new sync token
        if new_sync_token:
            self._save_sync_state(user_id, provider, calendar_id, new_sync_token)

        return results

    def _fast_incremental_sync(
        self,
        user_id: str,
        provider: str,
        calendar_id: str
    ) -> Dict:
        """
        Fast incremental: only check events modified in last hour.
        Used when we don't have a sync token but synced recently.
        """
        from calendars.google import auth
        from googleapiclient.discovery import build

        credentials = auth.load_credentials(user_id)
        if not credentials:
            raise ValueError("No credentials found")

        service = build('calendar', 'v3', credentials=credentials)

        # Only fetch events modified in last hour
        updated_min = (datetime.utcnow() - timedelta(hours=1)).isoformat() + 'Z'

        response = service.events().list(
            calendarId=calendar_id,
            updatedMin=updated_min,
            maxResults=SyncConfig.MAX_RESULTS_INCREMENTAL,
            showDeleted=True
        ).execute()

        results = {'events_added': 0, 'events_updated': 0, 'events_deleted': 0}

        for event in response.get('items', []):
            change = self._process_event(user_id, calendar_id, event)
            if change:
                results[f'events_{change}'] += 1

        # Get new sync token for next time
        sync_token = response.get('nextSyncToken')
        if sync_token:
            self._save_sync_state(user_id, provider, calendar_id, sync_token)

        return results

    def _full_sync(
        self,
        user_id: str,
        provider: str,
        calendar_id: str
    ) -> Dict:
        """
        Full sync: fetch all events from last year.
        Used on first sync or when token expires.
        """
        from calendars.google import auth
        from googleapiclient.discovery import build

        credentials = auth.load_credentials(user_id)
        if not credentials:
            raise ValueError("No credentials found")

        service = build('calendar', 'v3', credentials=credentials)

        # Fetch events from last year
        time_min = (datetime.utcnow() - timedelta(days=365)).isoformat() + 'Z'

        results = {'events_added': 0, 'events_updated': 0, 'events_deleted': 0}
        page_token = None
        new_sync_token = None

        while True:
            response = service.events().list(
                calendarId=calendar_id,
                timeMin=time_min,
                maxResults=SyncConfig.MAX_RESULTS_FULL,
                pageToken=page_token,
                showDeleted=True,
                singleEvents=True
            ).execute()

            # Process events
            for event in response.get('items', []):
                change = self._process_event(user_id, calendar_id, event)
                if change:
                    results[f'events_{change}'] += 1

            page_token = response.get('nextPageToken')
            if not page_token:
                new_sync_token = response.get('nextSyncToken')
                break

        # Save sync token
        if new_sync_token:
            self._save_sync_state(user_id, provider, calendar_id, new_sync_token)

        return results

    def _process_event(self, user_id: str, calendar_id: str, event: Dict) -> Optional[str]:
        """
        Process single event (create/update/delete).

        Returns:
            'added', 'updated', 'deleted', or None
        """

        provider_event_id = event['id']

        # Check if exists
        existing = Event.get_by_provider_event_id(
            user_id=user_id,
            provider='google',
            provider_event_id=provider_event_id
        )

        # Handle deletion
        if event.get('status') == 'cancelled':
            if existing:
                Event.soft_delete(existing['id'])
                return 'deleted'
            return None

        # Parse event
        event_data = {
            'summary': event.get('summary', 'Untitled Event'),
            'description': event.get('description'),
            'location': event.get('location'),
            'start_time': event.get('start', {}).get('dateTime'),
            'end_time': event.get('end', {}).get('dateTime'),
            'start_date': event.get('start', {}).get('date'),
            'end_date': event.get('end', {}).get('date'),
            'is_all_day': 'date' in event.get('start', {}),
            'timezone': event.get('start', {}).get('timeZone'),
            'calendar_name': calendar_id,
            'color_id': event.get('colorId')
        }

        # Create or update
        if existing:
            Event.update(existing['id'], event_data)
            return 'updated'
        else:
            EventService.create_provider_event(
                user_id=user_id,
                provider='google',
                provider_account_id=calendar_id,
                provider_event_id=provider_event_id,
                compute_embedding_now=False,
                **event_data
            )
            return 'added'

    def _get_sync_state(self, user_id: str, provider: str, calendar_id: str) -> Dict:
        """Get sync state from provider connection in users table."""
        conn = User.get_provider_connection(user_id, provider)
        if not conn:
            return {}

        return {
            'sync_token': conn.get('sync_token'),
            'last_synced_at': conn.get('last_synced_at')
        }

    def _save_sync_state(
        self,
        user_id: str,
        provider: str,
        calendar_id: str,
        sync_token: str
    ):
        """Save sync state to provider connection in users table."""
        user = User.get_by_id(user_id)
        if not user:
            return

        connections = user.get('provider_connections', [])

        # Find and update the provider connection
        for conn in connections:
            if conn.get('provider') == provider:
                conn['sync_token'] = sync_token
                conn['last_synced_at'] = datetime.utcnow().isoformat()
                break

        # Update users table
        from database.supabase_client import get_supabase
        supabase = get_supabase()
        supabase.table('users').update({
            'provider_connections': connections
        }).eq('id', user_id).execute()
