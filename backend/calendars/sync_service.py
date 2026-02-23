"""
Smart Sync Service - Intelligent calendar synchronization.
Automatically chooses the best sync strategy based on current state.
Also syncs the calendar list and triggers background pattern enrichment.
"""

import logging
import threading
from typing import Dict, List, Optional, Set

from datetime import datetime, timedelta
from database.models import Event, User, Calendar
from pipeline.events import EventService
from config.calendar import SyncConfig
from config.limits import EventLimits

logger = logging.getLogger(__name__)


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

        Syncs events from provider, then syncs the calendar list (metadata +
        background pattern enrichment for new calendars).

        Args:
            user_id: User's UUID

        Returns:
            Sync results with metadata, event counts, and calendar list
        """

        # Get current state
        state = self._analyze_sync_state(user_id)

        # Decide strategy
        strategy = self._choose_strategy(state)

        # Execute event sync
        results = self._execute_sync(user_id, state, strategy)

        # Sync calendar list (metadata + background enrichment)
        calendars = self._sync_calendars(user_id, state['provider'])

        return {
            'success': True,
            'strategy': strategy,
            'synced_at': datetime.utcnow().isoformat(),
            'calendars': calendars,
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

        provider = user.get('primary_calendar_provider')

        conn = User.get_primary_calendar_connection(user_id) if provider else None

        # Auto-detect: if no primary is set, find any connection with 'calendar' usage
        if not conn:
            connections = user.get('provider_connections', [])
            for c in connections:
                if 'calendar' in c.get('usage', []):
                    conn = c
                    provider = c.get('provider')
                    # Fix the missing primary_calendar_provider for future calls
                    try:
                        User.set_primary_calendar(user_id, provider)
                        logger.info(f"Auto-set primary_calendar_provider to '{provider}' for user {user_id[:8]}")
                    except Exception:
                        pass
                    break

        if not conn:
            raise ValueError("No calendar provider connected")

        if not provider:
            raise ValueError("Could not determine calendar provider")

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

        # Google has optimized sync token support; other providers use generic fetch
        if provider == 'google':
            if strategy == 'incremental':
                return self._google_incremental_sync(user_id, provider, calendar_id)
            elif strategy == 'fast_incremental':
                return self._google_fast_incremental_sync(user_id, provider, calendar_id)
            elif strategy == 'full':
                return self._google_full_sync(user_id, provider, calendar_id)
            else:
                raise ValueError(f"Unknown strategy: {strategy}")
        else:
            # Microsoft/Apple: use factory list_events (no sync token support yet)
            return self._generic_full_sync(user_id, provider, calendar_id)

    def _generic_full_sync(
        self,
        user_id: str,
        provider: str,
        calendar_id: str
    ) -> Dict:
        """
        Generic full sync for non-Google providers (Microsoft, Apple).
        Uses the factory's list_events() since these providers don't support sync tokens.
        """
        import calendars.factory as calendar_factory

        time_min = (datetime.utcnow() - timedelta(days=365)).isoformat() + 'Z'

        events = calendar_factory.list_events(
            user_id,
            max_results=SyncConfig.MAX_RESULTS_FULL,
            time_min=time_min,
            provider=provider,
            calendar_id=calendar_id
        )

        results = {'events_added': 0, 'events_updated': 0, 'events_deleted': 0}

        for event in events:
            change = self._process_event(user_id, provider, calendar_id, event)
            if change:
                results[f'events_{change}'] += 1

        # Update last_synced_at
        self._save_sync_state(user_id, provider, calendar_id, sync_token=None)

        return results

    def _google_incremental_sync(
        self,
        user_id: str,
        provider: str,
        calendar_id: str
    ) -> Dict:
        """
        Google-specific incremental sync using sync token.
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
                    change = self._process_event(user_id, provider, calendar_id, event)
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
                    return self._google_full_sync(user_id, provider, calendar_id)
                raise

        # Save new sync token
        if new_sync_token:
            self._save_sync_state(user_id, provider, calendar_id, new_sync_token)

        return results

    def _google_fast_incremental_sync(
        self,
        user_id: str,
        provider: str,
        calendar_id: str
    ) -> Dict:
        """
        Google-specific fast incremental: only check events modified in last hour.
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
            change = self._process_event(user_id, provider, calendar_id, event)
            if change:
                results[f'events_{change}'] += 1

        # Get new sync token for next time
        sync_token = response.get('nextSyncToken')
        if sync_token:
            self._save_sync_state(user_id, provider, calendar_id, sync_token)

        return results

    def _google_full_sync(
        self,
        user_id: str,
        provider: str,
        calendar_id: str
    ) -> Dict:
        """
        Google-specific full sync: fetch all events from last year.
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
                change = self._process_event(user_id, provider, calendar_id, event)
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

    def _process_event(self, user_id: str, provider: str, calendar_id: str, event: Dict) -> Optional[str]:
        """
        Process single event (create/update/delete).

        Returns:
            'added', 'updated', 'deleted', or None
        """

        provider_event_id = event['id']

        # Check if exists
        existing = Event.get_by_provider_event_id(
            user_id=user_id,
            provider=provider,
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
        }

        # Create or update
        if existing:
            Event.update(existing['id'], event_data)
            return 'updated'
        else:
            EventService.create_provider_event(
                user_id=user_id,
                provider=provider,
                provider_account_id=calendar_id,
                provider_event_id=provider_event_id,
                compute_embedding_now=False,
                **event_data
            )
            return 'added'

    # ========================================================================
    # Calendar List Sync + Pattern Enrichment
    # ========================================================================

    def _sync_calendars(self, user_id: str, provider: str) -> List[Dict]:
        """
        Sync the calendar list from the provider to the DB.

        1. Fetch current calendars from provider API
        2. Diff against stored calendars — upsert new/changed, delete removed
        3. For calendars missing an AI description, spawn a background thread
           to run LLM enrichment (non-blocking)
        4. Return the calendar list for the response

        Returns:
            List of calendar dicts for the frontend
        """
        import calendars.factory as calendar_factory

        try:
            current_calendars = calendar_factory.list_calendars(user_id)
        except Exception as e:
            logger.warning(f"Failed to fetch calendar list for {user_id[:8]}: {e}")
            # Fall back to DB calendars
            return self._calendars_from_db(user_id)

        if not current_calendars:
            return self._calendars_from_db(user_id)

        stored_calendars = Calendar.get_by_user(user_id)
        stored_lookup = {cal['provider_cal_id']: cal for cal in stored_calendars}
        current_cal_ids = {cal['id'] for cal in current_calendars}
        stored_cal_ids = set(stored_lookup.keys())

        # Detect removed calendars
        removed_cal_ids = stored_cal_ids - current_cal_ids
        for cal_id in removed_cal_ids:
            Calendar.delete_by_provider_cal_id(user_id, cal_id)

        # Upsert all current calendars (metadata: name, color, primary)
        needs_enrichment: List[Dict] = []
        for cal in current_calendars:
            cal_id = cal['id']
            stored = stored_lookup.get(cal_id)

            Calendar.upsert(
                user_id=user_id,
                provider=provider,
                provider_cal_id=cal_id,
                name=cal.get('summary', 'Unnamed'),
                color=cal.get('backgroundColor'),
                foreground_color=cal.get('foregroundColor'),
                is_primary=cal.get('primary', False),
            )

            # Track calendars that need LLM enrichment (no description yet)
            if not stored or not stored.get('description'):
                needs_enrichment.append(cal)

        # Background pattern enrichment for calendars missing descriptions
        if needs_enrichment:
            total_events = Event.count_user_events(user_id)
            if total_events >= EventLimits.MIN_EVENTS_FOR_PATTERN_DISCOVERY:
                logger.info(
                    f"Spawning background enrichment for {len(needs_enrichment)} "
                    f"calendar(s) for user {user_id[:8]}"
                )
                thread = threading.Thread(
                    target=self._enrich_calendars_background,
                    args=(user_id, provider, needs_enrichment),
                    daemon=True,
                    name=f"cal-enrich-{user_id[:8]}"
                )
                thread.start()

        # Return calendar list from DB (now has updated metadata)
        return self._calendars_from_db(user_id)

    def _calendars_from_db(self, user_id: str) -> List[Dict]:
        """Read calendars from DB and format for API response."""
        db_calendars = Calendar.get_by_user(user_id)
        return [{
            'id': cal['provider_cal_id'],
            'summary': cal['name'],
            'backgroundColor': cal.get('color', '#1170C5'),
            'foregroundColor': cal.get('foreground_color'),
            'primary': cal.get('is_primary', False),
            'description': cal.get('description'),
        } for cal in db_calendars]

    def _enrich_calendars_background(
        self,
        user_id: str,
        provider: str,
        calendars_to_enrich: List[Dict]
    ) -> None:
        """
        Background thread: run LLM analysis on calendars missing descriptions.
        Delegates to PatternRefreshService._analyze_and_save() — the single
        canonical path for fetch → filter → sample → LLM → upsert.
        """
        try:
            from config.posthog import set_tracking_context, flush_posthog

            set_tracking_context(
                distinct_id=user_id,
                trace_id=f"enrich-{user_id[:8]}",
                pipeline="Sync enrichment",
                input_type='sync_enrichment',
                is_guest=False,
            )

            # Lazy import — initialized in app.py
            from app import pattern_refresh_service

            for cal in calendars_to_enrich:
                try:
                    # stored_event_count=0 (default) → skips growth check,
                    # runs the full fetch → filter → sample → LLM → upsert path
                    pattern_refresh_service._analyze_and_save(
                        user_id=user_id,
                        provider=provider,
                        cal_id=cal['id'],
                        calendar=cal,
                    )
                    logger.info(f"Enriched calendar: {cal.get('summary', 'Unnamed')}")
                except Exception as e:
                    logger.warning(f"Failed to enrich calendar {cal.get('summary')}: {e}")

            logger.info(f"Background enrichment complete for user {user_id[:8]}")
            flush_posthog()

        except Exception as e:
            logger.error(f"Background enrichment failed for user {user_id[:8]}: {e}", exc_info=True)

    # ========================================================================
    # Sync State Management
    # ========================================================================

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
        sync_token: Optional[str] = None
    ):
        """Save sync state to provider connection in users table."""
        user = User.get_by_id(user_id)
        if not user:
            return

        connections = user.get('provider_connections', [])

        # Find and update the provider connection
        for conn in connections:
            if conn.get('provider') == provider:
                if sync_token is not None:
                    conn['sync_token'] = sync_token
                conn['last_synced_at'] = datetime.utcnow().isoformat()
                break

        # Update users table
        from database.supabase_client import get_supabase
        supabase = get_supabase()
        supabase.table('users').update({
            'provider_connections': connections
        }).eq('id', user_id).execute()
