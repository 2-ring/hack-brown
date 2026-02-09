"""
Personalization Service for managing user preferences.
Handles loading, saving, and applying learned patterns.
"""

import os
import json
from typing import Optional
from datetime import datetime
from preferences.models import UserPreferences


class PersonalizationService:
    """Service for managing user preferences and personalization"""

    def __init__(self, user_data_dir: str = 'user_data'):
        """
        Initialize personalization service.

        Args:
            user_data_dir: Directory to store user preference files
        """
        self.user_data_dir = user_data_dir
        os.makedirs(self.user_data_dir, exist_ok=True)

        # In-memory cache for user preferences
        # Maps user_id -> UserPreferences object
        # TODO: Add logic to update/invalidate cache when preferences change
        # TODO: Consider cache expiration policy (e.g., time-based invalidation)
        # TODO: Add cache size limits if needed (e.g., LRU eviction)
        self._preferences_cache = {}

        # In-memory cache for discovered patterns
        # Maps user_id -> Dict (pattern discovery output)
        self._patterns_cache = {}

    def _get_preferences_path(self, user_id: str) -> str:
        """Get file path for user's preferences"""
        return os.path.join(self.user_data_dir, f'{user_id}_preferences.json')

    def load_preferences(self, user_id: str) -> Optional[UserPreferences]:
        """
        Load user preferences from cache or disk.

        Args:
            user_id: User identifier

        Returns:
            UserPreferences object if exists, None otherwise
        """
        # Check cache first
        if user_id in self._preferences_cache:
            return self._preferences_cache[user_id]

        # Not in cache, try loading from disk
        preferences_path = self._get_preferences_path(user_id)

        if not os.path.exists(preferences_path):
            return None

        try:
            with open(preferences_path, 'r') as f:
                data = json.load(f)
                preferences = UserPreferences(**data)

                # Populate cache
                self._preferences_cache[user_id] = preferences

                return preferences
        except Exception as e:
            return None

    def save_preferences(self, preferences: UserPreferences) -> bool:
        """
        Save user preferences to disk and cache.

        Args:
            preferences: UserPreferences object to save

        Returns:
            True if successful, False otherwise
        """
        preferences_path = self._get_preferences_path(preferences.user_id)

        try:
            # Update last analyzed timestamp
            preferences.last_analyzed = datetime.utcnow().isoformat() + 'Z'

            # Save to disk
            with open(preferences_path, 'w') as f:
                json.dump(preferences.model_dump(), f, indent=2)

            # Update cache
            self._preferences_cache[preferences.user_id] = preferences

            return True

        except Exception as e:
            return False

    def delete_preferences(self, user_id: str) -> bool:
        """
        Delete user preferences from disk and cache.

        Args:
            user_id: User identifier

        Returns:
            True if successful, False otherwise
        """
        preferences_path = self._get_preferences_path(user_id)

        try:
            # Remove from cache
            if user_id in self._preferences_cache:
                del self._preferences_cache[user_id]

            # Remove from disk
            if os.path.exists(preferences_path):
                os.remove(preferences_path)
                return True
            else:
                return False

        except Exception as e:
            return False

    def has_preferences(self, user_id: str) -> bool:
        """
        Check if user has saved preferences.

        Args:
            user_id: User identifier

        Returns:
            True if preferences exist, False otherwise
        """
        preferences_path = self._get_preferences_path(user_id)
        return os.path.exists(preferences_path)

    def get_or_create_preferences(self, user_id: str, settings: dict = None) -> UserPreferences:
        """
        Get existing preferences or create new empty ones.

        Args:
            user_id: User identifier
            settings: Optional Google Calendar settings to initialize with

        Returns:
            UserPreferences object
        """
        # Try to load existing
        preferences = self.load_preferences(user_id)

        if preferences:
            return preferences

        # Create new

        preferences = UserPreferences(user_id=user_id)

        # Initialize with Google Calendar settings if provided
        if settings:
            preferences.timezone = settings.get('timezone')
            default_length = settings.get('defaultEventLength')
            if default_length:
                try:
                    preferences.default_event_length = int(default_length)
                except (ValueError, TypeError):
                    pass

        return preferences

    # =========================================================================
    # Pattern Storage Methods (New Simplified Approach)
    # =========================================================================

    def _get_patterns_path(self, user_id: str) -> str:
        """Get file path for user's discovered patterns"""
        return os.path.join(self.user_data_dir, f'{user_id}_patterns.json')

    def load_patterns(self, user_id: str) -> Optional[dict]:
        """
        Load discovered patterns from cache or disk.

        Args:
            user_id: User identifier

        Returns:
            Dict with patterns if exists, None otherwise
            Dict format:
                - user_id: str
                - category_patterns: Dict[category_id, summary]
                - style_stats: Dict with statistics
                - total_events_analyzed: int
        """
        # Check cache first
        if user_id in self._patterns_cache:
            return self._patterns_cache[user_id]

        # Not in cache, try loading from disk
        patterns_path = self._get_patterns_path(user_id)

        if not os.path.exists(patterns_path):
            return None

        try:
            with open(patterns_path, 'r') as f:
                patterns = json.load(f)

                # Populate cache
                self._patterns_cache[user_id] = patterns

                return patterns
        except Exception as e:
            print(f"Error loading patterns for {user_id}: {e}")
            return None

    def save_patterns(self, patterns: dict) -> bool:
        """
        Save discovered patterns to disk and cache.

        Args:
            patterns: Dict from PatternDiscoveryService.discover_patterns()

        Returns:
            True if successful, False otherwise
        """
        user_id = patterns.get('user_id')
        if not user_id:
            print("Error: patterns dict missing user_id")
            return False

        patterns_path = self._get_patterns_path(user_id)

        try:
            # Add timestamp
            patterns['last_updated'] = datetime.utcnow().isoformat() + 'Z'

            # Strip calendar data — it lives in the calendars DB table now.
            # Only style_stats, total_events_analyzed, and metadata stay in the file.
            file_patterns = {k: v for k, v in patterns.items()
                            if k not in ('category_patterns', 'calendar_metadata')}

            # Save to disk
            with open(patterns_path, 'w') as f:
                json.dump(file_patterns, f, indent=2)

            # Cache still holds the full dict (with category_patterns if present)
            self._patterns_cache[user_id] = patterns

            return True

        except Exception as e:
            print(f"Error saving patterns for {user_id}: {e}")
            return False

    def has_patterns(self, user_id: str) -> bool:
        """
        Check if user has discovered patterns.

        Args:
            user_id: User identifier

        Returns:
            True if patterns exist, False otherwise
        """
        # Check cache first for fast path
        if user_id in self._patterns_cache:
            return True

        patterns_path = self._get_patterns_path(user_id)
        return os.path.exists(patterns_path)

    def delete_patterns(self, user_id: str) -> bool:
        """
        Delete user's discovered patterns from disk and cache.

        Args:
            user_id: User identifier

        Returns:
            True if successful, False otherwise
        """
        patterns_path = self._get_patterns_path(user_id)

        try:
            # Remove from cache
            if user_id in self._patterns_cache:
                del self._patterns_cache[user_id]

            # Remove from disk
            if os.path.exists(patterns_path):
                os.remove(patterns_path)
                return True
            else:
                return False

        except Exception as e:
            print(f"Error deleting patterns for {user_id}: {e}")
            return False
