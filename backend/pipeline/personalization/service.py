"""
Personalization Service for managing user preferences.
All data is stored in the database (users.preferences JSONB + calendars table).
No local file I/O.
"""

import logging
from typing import Optional
from datetime import datetime

from database.models import User, Calendar

logger = logging.getLogger(__name__)


class PersonalizationService:
    """Service for managing user preferences and personalization via the database."""

    def __init__(self):
        # In-memory caches (per-process, cleared on deploy)
        self._patterns_cache = {}

    # =========================================================================
    # Patterns (style_stats + calendar data from DB)
    # =========================================================================

    def load_patterns(self, user_id: str) -> Optional[dict]:
        """
        Load discovered patterns from DB.

        Reads style_stats from users.preferences JSONB and
        calendar patterns from the calendars table.

        Returns:
            Dict with patterns if any exist, None otherwise.
        """
        if user_id in self._patterns_cache:
            return self._patterns_cache[user_id]

        user = User.get_by_id(user_id)
        if not user:
            return None

        prefs = user.get('preferences') or {}
        style_stats = prefs.get('style_stats')
        total_events_analyzed = prefs.get('total_events_analyzed', 0)

        # Load calendar patterns from calendars table
        db_calendars = Calendar.get_by_user(user_id)
        category_patterns = {}
        if db_calendars:
            for cal in db_calendars:
                category_patterns[cal['provider_cal_id']] = {
                    'name': cal['name'],
                    'is_primary': cal.get('is_primary', False),
                    'color': cal.get('color'),
                    'foreground_color': cal.get('foreground_color'),
                    'description': cal.get('description', ''),
                    'event_types': cal.get('event_types', []),
                    'examples': cal.get('examples', []),
                    'never_contains': cal.get('never_contains', []),
                }

        if not style_stats and not category_patterns:
            return None

        patterns = {
            'user_id': user_id,
            'style_stats': style_stats or {},
            'total_events_analyzed': total_events_analyzed,
            'category_patterns': category_patterns,
        }

        self._patterns_cache[user_id] = patterns
        return patterns

    def save_patterns(self, patterns: dict) -> bool:
        """
        Save discovered patterns to DB.

        style_stats → users.preferences JSONB
        category_patterns → calendars table (handled separately by sync/enrichment)
        """
        user_id = patterns.get('user_id')
        if not user_id:
            logger.error("patterns dict missing user_id")
            return False

        try:
            style_stats = patterns.get('style_stats', {})
            total_events_analyzed = patterns.get('total_events_analyzed', 0)

            User.save_style_stats(user_id, style_stats, total_events_analyzed)

            # Update cache
            self._patterns_cache[user_id] = patterns

            return True
        except Exception as e:
            logger.error(f"Error saving patterns for {user_id}: {e}")
            return False

    def has_patterns(self, user_id: str) -> bool:
        """Check if user has discovered patterns (style_stats or calendars)."""
        if user_id in self._patterns_cache:
            return True

        user = User.get_by_id(user_id)
        if not user:
            return False

        prefs = user.get('preferences') or {}
        if prefs.get('style_stats'):
            return True

        db_calendars = Calendar.get_by_user(user_id)
        return bool(db_calendars)

    def delete_patterns(self, user_id: str) -> bool:
        """Delete user's style_stats from DB and clear cache."""
        try:
            if user_id in self._patterns_cache:
                del self._patterns_cache[user_id]

            user = User.get_by_id(user_id)
            if not user:
                return False

            prefs = user.get('preferences') or {}
            prefs.pop('style_stats', None)
            prefs.pop('total_events_analyzed', None)
            prefs.pop('style_stats_updated_at', None)
            User.update_preferences(user_id, prefs)
            return True
        except Exception as e:
            logger.error(f"Error deleting patterns for {user_id}: {e}")
            return False

    # =========================================================================
    # Timezone (from users table directly)
    # =========================================================================

    @staticmethod
    def get_timezone(user_id: str) -> Optional[str]:
        """Get user's timezone from their profile."""
        user = User.get_by_id(user_id)
        if not user:
            return None
        return user.get('timezone')

    @staticmethod
    def save_timezone(user_id: str, timezone: str) -> None:
        """Save timezone to the users table."""
        from database.supabase_client import get_supabase
        supabase = get_supabase()
        supabase.table("users").update({"timezone": timezone}).eq("id", user_id).execute()
