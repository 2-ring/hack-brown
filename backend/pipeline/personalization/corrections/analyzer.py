"""
Correction Analyzer

Analyzes differences between system suggestions and user submissions.
Identifies what changed and classifies change types.
"""

import re
from typing import Dict, Optional, List
from datetime import datetime
from dateutil import parser as date_parser


class CorrectionAnalyzer:
    """
    Compares system suggestion vs user final submission.
    Returns structured correction data with field-by-field analysis.
    """

    def analyze_correction(
        self,
        system_event: Dict,
        user_event: Dict,
        original_input: str
    ) -> Optional[Dict]:
        """
        Main analysis method.

        Args:
            system_event: Event as system formatted it (from session.processed_events)
            user_event: Event as user submitted it
            original_input: Original messy input text

        Returns:
            Dict with:
                - fields_changed: List[str]
                - correction_type: str
                - title_change, time_change, etc.: Optional[Dict]

            Returns None if no changes detected.
        """

        changes = {}
        fields_changed = []

        # 1. Title comparison
        title_change = self._analyze_title_change(
            system_event.get('summary'),
            user_event.get('summary')
        )
        if title_change:
            changes['title_change'] = title_change
            fields_changed.append('title')

        # 2. Time comparison
        time_change = self._analyze_time_change(
            system_event.get('start'),
            user_event.get('start'),
            system_event.get('end'),
            user_event.get('end')
        )
        if time_change:
            changes['time_change'] = time_change
            fields_changed.append('start_time')

        # 3. Date comparison
        date_change = self._analyze_date_change(
            system_event.get('start'),
            user_event.get('start')
        )
        if date_change:
            changes['date_change'] = date_change
            fields_changed.append('date')

        # 4. Calendar comparison (if present in events)
        calendar_change = self._analyze_calendar_change(
            system_event.get('calendar'),
            user_event.get('calendar')
        )
        if calendar_change:
            changes['calendar_change'] = calendar_change
            fields_changed.append('calendar')

        # 5. Location comparison
        location_change = self._analyze_location_change(
            system_event.get('location'),
            user_event.get('location')
        )
        if location_change:
            changes['location_change'] = location_change
            fields_changed.append('location')

        # 7. Description comparison
        description_change = self._analyze_description_change(
            system_event.get('description'),
            user_event.get('description')
        )
        if description_change:
            changes['description_change'] = description_change
            fields_changed.append('description')

        # 8. Duration comparison
        duration_change = self._analyze_duration_change(
            system_event.get('start'),
            system_event.get('end'),
            user_event.get('start'),
            user_event.get('end')
        )
        if duration_change:
            changes['duration_change'] = duration_change
            fields_changed.append('duration')

        # If no changes, return None
        if len(fields_changed) == 0:
            return None

        # Determine correction type
        if len(fields_changed) == 1:
            correction_type = fields_changed[0]
        else:
            correction_type = 'multiple'

        return {
            'fields_changed': fields_changed,
            'correction_type': correction_type,
            **changes
        }

    def _analyze_title_change(self, system_title: Optional[str], user_title: Optional[str]) -> Optional[Dict]:
        """
        Classify title changes.

        Change types:
        - capitalization: Only case changed
        - length: Words added/removed
        - content: Substantial rewrite
        - formatting: Brackets, punctuation, special chars
        """
        # Handle None values
        if system_title == user_title:
            return None

        if not system_title or not user_title:
            change_type = 'added' if user_title else 'removed'
            return {
                'from': system_title or '',
                'to': user_title or '',
                'change_type': change_type
            }

        change_type = self._classify_title_change(system_title, user_title)

        return {
            'from': system_title,
            'to': user_title,
            'change_type': change_type,
            'word_count_from': len(system_title.split()),
            'word_count_to': len(user_title.split())
        }

    def _classify_title_change(self, from_title: str, to_title: str) -> str:
        """Determine type of title change"""
        # Only case changed?
        if from_title.lower() == to_title.lower():
            return 'capitalization'

        # Word count changed significantly?
        from_words = from_title.split()
        to_words = to_title.split()
        if abs(len(from_words) - len(to_words)) >= 2:
            return 'length'

        # Check for formatting changes (brackets, dashes, etc.)
        from_stripped = re.sub(r'[^\w\s]', '', from_title.lower())
        to_stripped = re.sub(r'[^\w\s]', '', to_title.lower())
        if from_stripped == to_stripped:
            return 'formatting'

        # Substantial content change
        return 'content'

    def _analyze_time_change(
        self,
        system_start: Optional[Dict],
        user_start: Optional[Dict],
        system_end: Optional[Dict],
        user_end: Optional[Dict]
    ) -> Optional[Dict]:
        """
        Classify time changes.

        Change types:
        - hour: Hour changed
        - minute: Minute changed
        - timezone: Timezone changed
        - all_day_toggle: Changed between timed and all-day
        """
        if not system_start or not user_start:
            return None

        # Extract time representations
        system_time = self._extract_time(system_start)
        user_time = self._extract_time(user_start)

        if system_time == user_time:
            return None

        # Detect all-day toggle
        system_all_day = 'date' in system_start and 'dateTime' not in system_start
        user_all_day = 'date' in user_start and 'dateTime' not in user_start

        if system_all_day != user_all_day:
            return {
                'from': system_time,
                'to': user_time,
                'change_type': 'all_day_toggle',
                'from_all_day': system_all_day,
                'to_all_day': user_all_day
            }

        # Parse times for comparison (if not all-day)
        if not system_all_day and not user_all_day:
            change_type = self._classify_time_change(system_time, user_time)
        else:
            change_type = 'time'

        return {
            'from': system_time,
            'to': user_time,
            'change_type': change_type
        }

    def _extract_time(self, event_time: Dict) -> str:
        """Extract time string from event start/end"""
        if 'dateTime' in event_time:
            return event_time['dateTime']
        elif 'date' in event_time:
            return event_time['date']
        return ''

    def _classify_time_change(self, from_time: str, to_time: str) -> str:
        """Classify what aspect of time changed"""
        try:
            from_dt = date_parser.parse(from_time)
            to_dt = date_parser.parse(to_time)

            # Hour changed?
            if from_dt.hour != to_dt.hour:
                return 'hour'

            # Minute changed?
            if from_dt.minute != to_dt.minute:
                return 'minute'

            # Timezone changed?
            if from_dt.tzinfo != to_dt.tzinfo:
                return 'timezone'

        except Exception:
            pass

        return 'time'

    def _analyze_date_change(
        self,
        system_start: Optional[Dict],
        user_start: Optional[Dict]
    ) -> Optional[Dict]:
        """
        Classify date changes.

        Change types:
        - day: Day changed
        - relative_interpretation: Different interpretation of relative dates
        """
        if not system_start or not user_start:
            return None

        system_date = self._extract_date(system_start)
        user_date = self._extract_date(user_start)

        if system_date == user_date:
            return None

        try:
            system_dt = date_parser.parse(system_date)
            user_dt = date_parser.parse(user_date)

            # Calculate day difference
            day_diff = abs((user_dt - system_dt).days)

            if day_diff == 1:
                change_type = 'off_by_one'
            elif day_diff <= 7:
                change_type = 'relative_interpretation'
            else:
                change_type = 'day'

        except Exception:
            change_type = 'day'

        return {
            'from': system_date,
            'to': user_date,
            'change_type': change_type
        }

    def _extract_date(self, event_time: Dict) -> str:
        """Extract date string from event start/end"""
        if 'dateTime' in event_time:
            # Extract just the date part
            return event_time['dateTime'].split('T')[0]
        elif 'date' in event_time:
            return event_time['date']
        return ''

    def _analyze_calendar_change(
        self,
        system_calendar: Optional[str],
        user_calendar: Optional[str]
    ) -> Optional[Dict]:
        """Analyze calendar assignment changes"""
        if system_calendar == user_calendar:
            return None

        return {
            'from': system_calendar or 'primary',
            'to': user_calendar or 'primary',
            'change_type': 'category_mismatch'
        }

    def _analyze_location_change(
        self,
        system_location: Optional[str],
        user_location: Optional[str]
    ) -> Optional[Dict]:
        """Analyze location changes"""
        if system_location == user_location:
            return None

        # Determine change type
        if not system_location and user_location:
            change_type = 'added'
        elif system_location and not user_location:
            change_type = 'removed'
        else:
            # Check if it's a spelling/formatting change
            if system_location and user_location:
                system_normalized = system_location.lower().strip()
                user_normalized = user_location.lower().strip()
                if system_normalized == user_normalized:
                    change_type = 'capitalization'
                elif self._is_abbreviation_expansion(system_location, user_location):
                    change_type = 'abbreviation_expansion'
                else:
                    change_type = 'modified'
            else:
                change_type = 'modified'

        return {
            'from': system_location or '',
            'to': user_location or '',
            'change_type': change_type
        }

    def _is_abbreviation_expansion(self, short: str, long: str) -> bool:
        """Check if long is an expansion of short"""
        # Simple heuristic: if short is contained in long and long is longer
        short_words = set(short.lower().split())
        long_words = set(long.lower().split())
        return short_words.issubset(long_words) and len(long) > len(short)

    def _analyze_description_change(
        self,
        system_desc: Optional[str],
        user_desc: Optional[str]
    ) -> Optional[Dict]:
        """Analyze description changes"""
        if system_desc == user_desc:
            return None

        if not system_desc and user_desc:
            change_type = 'added'
        elif system_desc and not user_desc:
            change_type = 'removed'
        else:
            change_type = 'modified'

        return {
            'from': system_desc or '',
            'to': user_desc or '',
            'change_type': change_type
        }

    def _analyze_duration_change(
        self,
        system_start: Optional[Dict],
        system_end: Optional[Dict],
        user_start: Optional[Dict],
        user_end: Optional[Dict]
    ) -> Optional[Dict]:
        """Analyze duration changes"""
        if not all([system_start, system_end, user_start, user_end]):
            return None

        try:
            system_duration = self._calculate_duration(system_start, system_end)
            user_duration = self._calculate_duration(user_start, user_end)

            if system_duration == user_duration:
                return None

            change_type = 'lengthened' if user_duration > system_duration else 'shortened'

            return {
                'from': system_duration,
                'to': user_duration,
                'change_type': change_type,
                'difference_minutes': abs(user_duration - system_duration)
            }
        except Exception:
            return None

    def _calculate_duration(self, start: Dict, end: Dict) -> int:
        """Calculate duration in minutes"""
        start_str = start.get('dateTime') or start.get('date')
        end_str = end.get('dateTime') or end.get('date')

        if not start_str or not end_str:
            return 0

        start_dt = date_parser.parse(start_str)
        end_dt = date_parser.parse(end_str)

        duration = (end_dt - start_dt).total_seconds() / 60
        return int(duration)
