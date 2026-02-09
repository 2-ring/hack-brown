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
from preferences.pattern_discovery_service import PatternDiscoveryService
from preferences.service import PersonalizationService
from config.calendar import RefreshConfig
from config.posthog import set_tracking_context
from config.similarity import PatternDiscoveryConfig

logger = logging.getLogger(__name__)


class PatternRefreshService:
    """
    Manages incremental background refresh of user patterns.

    Thread-safe per user. Multiple sessions for the same user
    won't trigger concurrent refreshes.
    """

    def __init__(
        self,
        pattern_discovery_service: PatternDiscoveryService,
        personalization_service: PersonalizationService,
    ):
        self.pattern_discovery_service = pattern_discovery_service
        self.personalization_service = personalization_service

        # Per-user refresh locks
        self._refresh_locks: Dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    def _get_user_lock(self, user_id: str) -> threading.Lock:
        with self._locks_guard:
            if user_id not in self._refresh_locks:
                self._refresh_locks[user_id] = threading.Lock()
            return self._refresh_locks[user_id]

    def maybe_refresh(self, user_id: str, patterns: Dict) -> None:
        """
        Check if patterns need refreshing and spawn background thread if so.

        Non-blocking: returns immediately. Refresh happens in background
        and benefits the next session.

        Args:
            user_id: User's UUID
            patterns: Currently loaded patterns dict
        """
        try:
            lock = self._get_user_lock(user_id)
            if lock.locked():
                return

            # Fetch current calendar list (~100ms)
            current_calendars = calendar_factory.list_calendars(user_id)
            if not current_calendars:
                return

            new_cal_ids, stale_cal_ids = self._determine_refresh_targets(
                patterns, current_calendars
            )
            removed_cal_ids = self._detect_removed_calendars(
                patterns, current_calendars
            )

            if not new_cal_ids and not stale_cal_ids and not removed_cal_ids:
                return

            logger.info(
                f"Pattern refresh needed for user {user_id[:8]}: "
                f"{len(new_cal_ids)} new, {len(stale_cal_ids)} stale, "
                f"{len(removed_cal_ids)} removed"
            )

            thread = threading.Thread(
                target=self._run_refresh,
                args=(user_id, patterns, current_calendars,
                      new_cal_ids, stale_cal_ids, removed_cal_ids),
                daemon=True,
                name=f"pattern-refresh-{user_id[:8]}"
            )
            thread.start()

        except Exception as e:
            logger.warning(f"Error checking pattern refresh for {user_id[:8]}: {e}")

    def _determine_refresh_targets(
        self,
        patterns: Dict,
        current_calendars: List[Dict]
    ) -> Tuple[Set[str], Set[str]]:
        """
        Compare stored patterns with current calendar list.

        Returns:
            (new_calendar_ids, stale_calendar_ids)
        """
        stored_cal_ids = set(patterns.get('category_patterns', {}).keys())
        current_cal_ids = {cal['id'] for cal in current_calendars}
        calendar_metadata = patterns.get('calendar_metadata', {})

        # New calendars
        new_cal_ids = current_cal_ids - stored_cal_ids

        # Stale calendars: check refresh interval
        stale_cal_ids = set()
        now = datetime.utcnow()

        for cal_id in stored_cal_ids & current_cal_ids:
            meta = calendar_metadata.get(cal_id, {})

            last_refreshed_str = meta.get('last_refreshed')
            if not last_refreshed_str:
                # Legacy patterns without metadata — use global last_updated
                last_refreshed_str = patterns.get('last_updated')

            if last_refreshed_str:
                try:
                    last_refreshed = datetime.fromisoformat(
                        last_refreshed_str.replace('Z', '+00:00')
                    ).replace(tzinfo=None)
                    if (now - last_refreshed).days < RefreshConfig.MIN_REFRESH_INTERVAL_DAYS:
                        continue
                except (ValueError, AttributeError):
                    pass

            # Old enough to check — actual growth check happens in _analyze_single_calendar
            stale_cal_ids.add(cal_id)

        return new_cal_ids, stale_cal_ids

    def _detect_removed_calendars(
        self,
        patterns: Dict,
        current_calendars: List[Dict]
    ) -> Set[str]:
        stored_cal_ids = set(patterns.get('category_patterns', {}).keys())
        current_cal_ids = {cal['id'] for cal in current_calendars}
        return stored_cal_ids - current_cal_ids

    def _run_refresh(
        self,
        user_id: str,
        patterns: Dict,
        current_calendars: List[Dict],
        new_cal_ids: Set[str],
        stale_cal_ids: Set[str],
        removed_cal_ids: Set[str]
    ) -> None:
        """Background thread: fetch events, run LLM analysis, merge results."""
        lock = self._get_user_lock(user_id)
        if not lock.acquire(blocking=False):
            logger.info(f"Refresh already in progress for user {user_id[:8]}")
            return

        try:
            set_tracking_context(
                distinct_id=user_id,
                trace_id=f"refresh-{user_id[:8]}"
            )

            cal_lookup = {cal['id']: cal for cal in current_calendars}
            category_patterns = dict(patterns.get('category_patterns', {}))
            calendar_metadata = dict(patterns.get('calendar_metadata', {}))

            # Process new calendars
            for cal_id in new_cal_ids:
                cal = cal_lookup.get(cal_id)
                if not cal:
                    continue
                logger.info(f"Analyzing new calendar: {cal.get('summary', cal_id)}")
                result = self._analyze_single_calendar(user_id, cal_id, cal)
                if result:
                    category_patterns[cal_id] = result['pattern']
                    calendar_metadata[cal_id] = result['metadata']

            # Process stale calendars (with event count growth check)
            for cal_id in stale_cal_ids:
                cal = cal_lookup.get(cal_id)
                if not cal:
                    continue
                stored_count = calendar_metadata.get(cal_id, {}).get('events_analyzed', 0)
                result = self._analyze_single_calendar(
                    user_id, cal_id, cal, stored_event_count=stored_count
                )
                if result:
                    # Empty pattern = growth below threshold, keep existing pattern
                    if result['pattern']:
                        category_patterns[cal_id] = result['pattern']
                    calendar_metadata[cal_id] = result['metadata']

            # Remove deleted calendars
            for cal_id in removed_cal_ids:
                category_patterns.pop(cal_id, None)
                calendar_metadata.pop(cal_id, None)
                logger.info(f"Removed calendar from patterns: {cal_id}")

            # Save updated patterns
            updated_patterns = dict(patterns)
            updated_patterns['category_patterns'] = category_patterns
            updated_patterns['calendar_metadata'] = calendar_metadata
            self.personalization_service.save_patterns(updated_patterns)

            logger.info(
                f"Pattern refresh complete for user {user_id[:8]}: "
                f"{len(new_cal_ids)} added, {len(stale_cal_ids)} refreshed, "
                f"{len(removed_cal_ids)} removed"
            )

        except Exception as e:
            logger.error(f"Pattern refresh failed for user {user_id[:8]}: {e}", exc_info=True)
        finally:
            lock.release()

    def _analyze_single_calendar(
        self,
        user_id: str,
        cal_id: str,
        calendar: Dict,
        stored_event_count: int = 0
    ) -> Optional[Dict]:
        """
        Fetch events and run LLM analysis for a single calendar.

        For stale calendars, checks event count growth before running
        the LLM. Skips if growth is below threshold.

        Returns:
            Dict with 'pattern' and 'metadata' keys, or None on failure
        """
        cal_name = calendar.get('summary', 'Unnamed')
        is_primary = calendar.get('primary', False)
        cal_color = calendar.get('backgroundColor')
        cal_foreground_color = calendar.get('foregroundColor')
        now_str = datetime.utcnow().isoformat() + 'Z'

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
            return None

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
                # Update timestamp so we don't re-check too soon
                return {
                    'pattern': {},  # signals: keep existing pattern
                    'metadata': {
                        'events_analyzed': stored_event_count,
                        'last_refreshed': now_str
                    }
                }

        # Empty calendar
        if not events:
            return {
                'pattern': {
                    'name': cal_name,
                    'is_primary': is_primary,
                    'color': cal_color,
                    'foreground_color': cal_foreground_color,
                    'description': 'This category has no events in the analyzed period',
                    'event_types': [],
                    'examples': [],
                    'never_contains': []
                },
                'metadata': {
                    'events_analyzed': 0,
                    'last_refreshed': now_str
                }
            }

        # Sample and analyze
        sampled = self.pattern_discovery_service._smart_sample_weighted(
            events,
            target=PatternDiscoveryConfig.TARGET_SAMPLE_SIZE,
            recency_bias=PatternDiscoveryConfig.RECENCY_BIAS_DEFAULT
        )

        summary = self.pattern_discovery_service._analyze_category_with_llm(
            category_name=cal_name,
            is_primary=is_primary,
            events=sampled,
            total_count=current_count
        )

        return {
            'pattern': {
                'name': cal_name,
                'is_primary': is_primary,
                'color': cal_color,
                'foreground_color': cal_foreground_color,
                **summary
            },
            'metadata': {
                'events_analyzed': current_count,
                'last_refreshed': now_str
            }
        }
