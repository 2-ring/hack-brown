"""
Incremental pattern refresh service.

Detects new/stale calendars and refreshes their patterns in the background.
Runs non-blocking during event processing — current session uses existing
patterns, refresh benefits the next session.
"""

import logging
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set, Tuple

import calendars.factory as calendar_factory
from database.models import Calendar
from pipeline.personalization.pattern_discovery import PatternDiscoveryService
from config.calendar import RefreshConfig
from config.posthog import set_tracking_context, flush_posthog
from config.similarity import PatternDiscoveryConfig

logger = logging.getLogger(__name__)


class PatternRefreshService:
    """
    Manages incremental background refresh of user calendars.

    Thread-safe per user. Multiple sessions for the same user
    won't trigger concurrent refreshes.
    """

    def __init__(self, pattern_discovery_service: PatternDiscoveryService):
        self.pattern_discovery_service = pattern_discovery_service

        # Per-user refresh locks
        self._refresh_locks: Dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    def _get_user_lock(self, user_id: str) -> threading.Lock:
        with self._locks_guard:
            if user_id not in self._refresh_locks:
                self._refresh_locks[user_id] = threading.Lock()
            return self._refresh_locks[user_id]

    def maybe_refresh(self, user_id: str) -> None:
        """
        Check if calendars need refreshing and spawn background thread if so.

        Non-blocking: returns immediately. Refresh happens in background
        and benefits the next session.

        Args:
            user_id: User's UUID
        """
        try:
            lock = self._get_user_lock(user_id)
            if lock.locked():
                return

            # Fetch current calendar list from provider (~100ms)
            current_calendars = calendar_factory.list_calendars(user_id)
            if not current_calendars:
                return

            # Load stored calendars from DB
            stored_calendars = Calendar.get_by_user(user_id)
            stored_lookup = {
                cal['provider_cal_id']: cal for cal in stored_calendars
            }

            new_cal_ids, stale_cal_ids = self._determine_refresh_targets(
                stored_lookup, current_calendars
            )
            removed_cal_ids = self._detect_removed_calendars(
                stored_lookup, current_calendars
            )

            if not new_cal_ids and not stale_cal_ids and not removed_cal_ids:
                return

            logger.info(
                f"Calendar refresh needed for user {user_id[:8]}: "
                f"{len(new_cal_ids)} new, {len(stale_cal_ids)} stale, "
                f"{len(removed_cal_ids)} removed"
            )

            thread = threading.Thread(
                target=self._run_refresh,
                args=(user_id, stored_lookup, current_calendars,
                      new_cal_ids, stale_cal_ids, removed_cal_ids),
                daemon=True,
                name=f"calendar-refresh-{user_id[:8]}"
            )
            thread.start()

        except Exception as e:
            logger.warning(f"Error checking calendar refresh for {user_id[:8]}: {e}")

    def _determine_refresh_targets(
        self,
        stored_lookup: Dict[str, Dict],
        current_calendars: List[Dict]
    ) -> Tuple[Set[str], Set[str]]:
        """
        Compare stored calendars with current provider list.

        Returns:
            (new_calendar_ids, stale_calendar_ids)
        """
        stored_cal_ids = set(stored_lookup.keys())
        current_cal_ids = {cal['id'] for cal in current_calendars}

        # New calendars
        new_cal_ids = current_cal_ids - stored_cal_ids

        # Stale calendars: check refresh interval
        stale_cal_ids = set()
        now = datetime.utcnow()

        for cal_id in stored_cal_ids & current_cal_ids:
            stored = stored_lookup[cal_id]

            last_refreshed_str = stored.get('last_refreshed')
            if last_refreshed_str:
                try:
                    if isinstance(last_refreshed_str, str):
                        last_refreshed = datetime.fromisoformat(
                            last_refreshed_str.replace('Z', '+00:00')
                        ).replace(tzinfo=None)
                    else:
                        last_refreshed = last_refreshed_str.replace(tzinfo=None)
                    if (now - last_refreshed).days < RefreshConfig.MIN_REFRESH_INTERVAL_DAYS:
                        continue
                except (ValueError, AttributeError):
                    pass

            # Old enough to check — actual growth check happens in _analyze_single_calendar
            stale_cal_ids.add(cal_id)

        return new_cal_ids, stale_cal_ids

    def _detect_removed_calendars(
        self,
        stored_lookup: Dict[str, Dict],
        current_calendars: List[Dict]
    ) -> Set[str]:
        stored_cal_ids = set(stored_lookup.keys())
        current_cal_ids = {cal['id'] for cal in current_calendars}
        return stored_cal_ids - current_cal_ids

    def _run_refresh(
        self,
        user_id: str,
        stored_lookup: Dict[str, Dict],
        current_calendars: List[Dict],
        new_cal_ids: Set[str],
        stale_cal_ids: Set[str],
        removed_cal_ids: Set[str]
    ) -> None:
        """Background thread: fetch events, run LLM analysis, write to DB."""
        lock = self._get_user_lock(user_id)
        if not lock.acquire(blocking=False):
            logger.info(f"Refresh already in progress for user {user_id[:8]}")
            return

        try:
            set_tracking_context(
                distinct_id=user_id,
                trace_id=f"refresh-{user_id[:8]}",
                pipeline="Pattern refresh",
                input_type='pattern_refresh',
                is_guest=False,
            )

            # Look up provider
            from database.models import User
            user = User.get_by_id(user_id)
            provider = (user or {}).get('primary_calendar_provider')
            if not provider:
                # Auto-detect from provider_connections
                connections = (user or {}).get('provider_connections', [])
                for conn in connections:
                    if 'calendar' in conn.get('usage', []):
                        provider = conn.get('provider')
                        break
                provider = provider or 'google'

            cal_lookup = {cal['id']: cal for cal in current_calendars}

            # Process new calendars
            for cal_id in new_cal_ids:
                cal = cal_lookup.get(cal_id)
                if not cal:
                    continue
                logger.info(f"Analyzing new calendar: {cal.get('summary', cal_id)}")
                self._analyze_and_save(user_id, provider, cal_id, cal)

            # Process stale calendars (with event count growth check)
            for cal_id in stale_cal_ids:
                cal = cal_lookup.get(cal_id)
                if not cal:
                    continue
                stored_count = stored_lookup.get(cal_id, {}).get('events_analyzed', 0)
                self._analyze_and_save(
                    user_id, provider, cal_id, cal,
                    stored_event_count=stored_count
                )

            # Remove deleted calendars
            for cal_id in removed_cal_ids:
                Calendar.delete_by_provider_cal_id(user_id, cal_id)
                logger.info(f"Removed calendar from DB: {cal_id}")

            # Also update metadata (name/color) for calendars that changed in provider
            for cal in current_calendars:
                cal_id = cal['id']
                if cal_id in new_cal_ids or cal_id in removed_cal_ids:
                    continue
                stored = stored_lookup.get(cal_id)
                if not stored:
                    continue
                # Check if provider metadata changed
                if (stored.get('name') != cal.get('summary') or
                    stored.get('color') != cal.get('backgroundColor') or
                    stored.get('is_primary') != cal.get('primary', False)):
                    Calendar.upsert(
                        user_id=user_id,
                        provider=provider,
                        provider_cal_id=cal_id,
                        name=cal.get('summary', 'Unnamed'),
                        color=cal.get('backgroundColor'),
                        foreground_color=cal.get('foregroundColor'),
                        is_primary=cal.get('primary', False),
                    )
                    logger.info(f"Updated metadata for calendar: {cal.get('summary')}")

            logger.info(
                f"Calendar refresh complete for user {user_id[:8]}: "
                f"{len(new_cal_ids)} added, {len(stale_cal_ids)} refreshed, "
                f"{len(removed_cal_ids)} removed"
            )

        except Exception as e:
            logger.error(f"Calendar refresh failed for user {user_id[:8]}: {e}", exc_info=True)
        finally:
            flush_posthog()
            lock.release()

    def _analyze_and_save(
        self,
        user_id: str,
        provider: str,
        cal_id: str,
        calendar: Dict,
        stored_event_count: int = 0
    ) -> None:
        """
        Fetch events, run LLM analysis for a single calendar, write to DB.

        For stale calendars, checks event count growth before running
        the LLM. Skips if growth is below threshold.
        """
        cal_name = calendar.get('summary', 'Unnamed')
        is_primary = calendar.get('primary', False)

        try:
            time_min = (
                datetime.utcnow() - timedelta(days=RefreshConfig.EVENT_LOOKBACK_DAYS)
            ).isoformat() + 'Z'

            events = calendar_factory.list_events(
                user_id=user_id,
                max_results=RefreshConfig.MAX_EVENTS_PER_CALENDAR,
                time_min=time_min,
                calendar_id=cal_id
            )
        except Exception as e:
            logger.warning(f"Failed to fetch events for calendar {cal_name}: {e}")
            return

        # Filter noise
        events = [e for e in events if e.get('summary') and e.get('status') != 'cancelled']

        # Tag events with source calendar
        for event in events:
            event['_source_calendar_id'] = cal_id
            event['_source_calendar_name'] = cal_name

        current_count = len(events)

        # For stale calendars, check if growth warrants an LLM call.
        # Adaptive threshold: ratio-based for small calendars, capped for large ones,
        # with a floor to ignore noise on tiny calendars.
        if stored_event_count > 0:
            growth = current_count - stored_event_count
            growth_threshold = max(
                RefreshConfig.EVENT_GROWTH_FLOOR,
                min(
                    stored_event_count * RefreshConfig.EVENT_GROWTH_RATIO,
                    RefreshConfig.EVENT_GROWTH_CAP
                )
            )

            if growth < growth_threshold:
                logger.info(
                    f"Skipping LLM refresh for {cal_name}: "
                    f"growth {growth} below threshold {growth_threshold:.0f}"
                )
                # Upsert with just metadata update (no AI fields change)
                Calendar.upsert(
                    user_id=user_id,
                    provider=provider,
                    provider_cal_id=cal_id,
                    name=cal_name,
                    color=calendar.get('backgroundColor'),
                    foreground_color=calendar.get('foregroundColor'),
                    is_primary=is_primary,
                    last_refreshed=datetime.utcnow().isoformat() + 'Z',
                )
                return

        # Empty calendar — save with empty description
        if not events:
            Calendar.upsert(
                user_id=user_id,
                provider=provider,
                provider_cal_id=cal_id,
                name=cal_name,
                color=calendar.get('backgroundColor'),
                foreground_color=calendar.get('foregroundColor'),
                is_primary=is_primary,
                description='This category has no events in the analyzed period',
                event_types=[],
                examples=[],
                never_contains=[],
                events_analyzed=0,
                last_refreshed=datetime.utcnow().isoformat() + 'Z',
            )
            return

        # Set calendar name in tracking context for the LLM call
        set_tracking_context(calendar_name=cal_name)

        # Load other calendar descriptions for cross-context
        all_calendars = Calendar.get_by_user(user_id)
        other_calendars = [
            {'name': c['name'], 'description': c['description']}
            for c in all_calendars
            if c.get('description') and c['provider_cal_id'] != cal_id
        ] or None

        # Sample and analyze with LLM
        sampled = self.pattern_discovery_service._smart_sample_weighted(
            events,
            target=PatternDiscoveryConfig.TARGET_SAMPLE_SIZE,
            recency_bias=PatternDiscoveryConfig.RECENCY_BIAS_DEFAULT
        )

        summary = self.pattern_discovery_service._analyze_category_with_llm(
            category_name=cal_name,
            is_primary=is_primary,
            events=sampled,
            total_count=current_count,
            other_calendars=other_calendars
        )

        Calendar.upsert(
            user_id=user_id,
            provider=provider,
            provider_cal_id=cal_id,
            name=cal_name,
            color=calendar.get('backgroundColor'),
            foreground_color=calendar.get('foregroundColor'),
            is_primary=is_primary,
            description=summary.get('description'),
            event_types=summary.get('event_types', []),
            examples=summary.get('examples', []),
            never_contains=summary.get('never_contains', []),
            events_analyzed=current_count,
            last_refreshed=datetime.utcnow().isoformat() + 'Z',
        )
