"""
Data Collection Service for Personalization Analysis.
Efficiently fetches calendar events using smart sampling strategies.
"""

from datetime import datetime, timedelta
from typing import List, Dict, Optional
import time
from calendars.service import CalendarService


class DataCollectionService:
    """
    Service for collecting calendar events for pattern analysis.
    Uses adaptive sampling strategies to balance thoroughness with performance.
    """

    def __init__(self, calendar_service: CalendarService):
        """
        Initialize data collection service.

        Args:
            calendar_service: Authenticated CalendarService instance
        """
        self.calendar_service = calendar_service

    def collect_for_analysis(self, mode: str = 'quick') -> List[Dict]:
        """
        Main entry point for data collection.

        Args:
            mode: Collection mode - 'quick' (fast, recent data), 'deep' (thorough, historical),
                  or 'comprehensive' (all events from last year)

        Returns:
            List of event dictionaries ready for pattern analysis

        Raises:
            ValueError: If mode is not recognized
        """

        if mode == 'quick':
            events = self._quick_collection()
        elif mode == 'deep':
            events = self._deep_collection()
        elif mode == 'comprehensive':
            events = self._comprehensive_collection()
        else:
            raise ValueError(f"Unknown collection mode: {mode}. Use 'quick', 'deep', or 'comprehensive'.")

        # Filter out noise
        filtered_events = self._filter_relevant_events(events)


        return filtered_events

    def _quick_collection(self) -> List[Dict]:
        """
        Fast collection strategy using only recent data.
        - Timeframe: Last 3 months
        - Max events: 250
        - API calls: 1-2
        - Time: 2-5 seconds

        Ideal for first-time setup and most users.
        """

        time_min = self._calculate_date_ago(months=3)
        events = self.calendar_service.list_events(
            max_results=250,
            time_min=time_min
        )

        # If calendar is sparse, extend time range
        if len(events) < 30:
            time_min = self._calculate_date_ago(months=12)
            events = self.calendar_service.list_events(
                max_results=250,
                time_min=time_min
            )

        return events

    def _deep_collection(self) -> List[Dict]:
        """
        Comprehensive collection with smart sampling.
        - Timeframe: Last 12 months
        - Max events: 300-500
        - API calls: 5-15
        - Time: 10-30 seconds

        For users who want thorough analysis and comprehensive insights.
        """

        all_events = []

        # Tier 1: Recent events (last 3 months, full fetch)
        recent = self._fetch_range(
            months_back=3,
            max_events=200
        )
        all_events.extend(recent)

        # Tier 2: Historical sample (3-12 months ago)
        if len(recent) >= 20:  # Only if calendar is reasonably active
            historical = self._fetch_sampled_range(
                start_months_back=12,
                end_months_back=3,
                sample_size=150
            )
            all_events.extend(historical)
        else:

        # Deduplicate (in case of overlaps)
        all_events = self._deduplicate_events(all_events)

        return all_events

    def _comprehensive_collection(self) -> List[Dict]:
        """
        Comprehensive one-time collection: Last 12 months, ALL events from ALL calendars.
        - Timeframe: Last 365 days
        - Max events: All (up to 10,000 safety cap per calendar)
        - API calls: 5-50 per calendar (depends on calendar size)
        - Time: 30-90 seconds

        For one-time comprehensive analysis to learn user patterns.
        Uses pagination to fetch everything without sampling.
        Fetches from ALL calendars, not just primary.
        """

        time_min = self._calculate_date_ago(days=365)

        # Get list of all calendars first
        calendars = self.calendar_service.get_calendar_list()

        # Fetch events from each calendar
        all_events = []
        for calendar in calendars:
            cal_id = calendar.get('id')
            cal_name = calendar.get('summary', 'Unnamed')

            try:

                # Fetch events from this calendar
                calendar_events = self._fetch_all_with_pagination(
                    time_min=time_min,
                    max_total=10000,  # Safety cap per calendar
                    calendar_id=cal_id
                )

                # Add calendar metadata to each event
                for event in calendar_events:
                    event['_source_calendar_id'] = cal_id
                    event['_source_calendar_name'] = cal_name

                all_events.extend(calendar_events)

            except Exception as e:
                continue

        return all_events

    def _fetch_all_with_pagination(self, time_min: str, max_total: int = 10000, calendar_id: str = 'primary') -> List[Dict]:
        """
        Fetch all events with automatic pagination.
        Keeps requesting pages until no more results or max_total reached.

        Args:
            time_min: Start date for event search (ISO format with 'Z')
            max_total: Safety cap on total events to prevent runaway fetching
            calendar_id: ID of the calendar to fetch events from (default: 'primary')

        Returns:
            List of all events in the time range
        """
        all_events = []
        page_token = None
        page_num = 1

        while len(all_events) < max_total:
            try:
                # Fetch page using full response mode
                response = self.calendar_service.list_events(
                    max_results=250,  # Default page size
                    time_min=time_min,
                    page_token=page_token,
                    return_full_response=True,
                    calendar_id=calendar_id
                )

                # Extract events from this page
                events = response.get('items', [])
                all_events.extend(events)


                # Check for next page
                page_token = response.get('nextPageToken')
                if not page_token:
                    break

                page_num += 1

                # Small delay to respect rate limits
                time.sleep(0.1)

            except Exception as e:
                break

        # Enforce safety cap
        if len(all_events) > max_total:
            all_events = all_events[:max_total]

        return all_events

    def _fetch_range(self, months_back: int, max_events: int) -> List[Dict]:
        """
        Fetch events from a time range going back N months.

        Args:
            months_back: Number of months to go back
            max_events: Maximum number of events to fetch

        Returns:
            List of events
        """
        time_min = self._calculate_date_ago(months=months_back)

        events = self.calendar_service.list_events(
            max_results=max_events,
            time_min=time_min
        )

        return events

    def _fetch_sampled_range(
        self,
        start_months_back: int,
        end_months_back: int,
        sample_size: int
    ) -> List[Dict]:
        """
        Fetch sampled events distributed across a time range.
        Uses stratified sampling by month for better coverage.

        Args:
            start_months_back: Start of time range (e.g., 12 months ago)
            end_months_back: End of time range (e.g., 3 months ago)
            sample_size: Total number of events to sample

        Returns:
            List of sampled events
        """
        time_min_str = self._calculate_date_ago(months=start_months_back)
        time_max_str = self._calculate_date_ago(months=end_months_back)

        months_in_range = start_months_back - end_months_back
        per_month = max(sample_size // months_in_range, 5)  # At least 5 per month

        sampled = []

        for month_offset in range(months_in_range):
            month_start = self._calculate_date_ago(
                months=start_months_back - month_offset
            )
            month_end = self._calculate_date_ago(
                months=start_months_back - month_offset - 1
            )

            try:
                month_events = self.calendar_service.list_events(
                    max_results=per_month,
                    time_min=month_start
                )

                # Filter to only events in this specific month
                month_events = [
                    e for e in month_events
                    if self._is_in_range(e, month_start, month_end)
                ]

                sampled.extend(month_events)

                # Small delay to respect rate limits
                time.sleep(0.1)

            except Exception as e:
                continue

        return sampled

    def _filter_relevant_events(self, events: List[Dict]) -> List[Dict]:
        """
        Filter out events that don't contribute to pattern learning.

        Removes:
        - Cancelled events
        - All-day birthdays (auto-generated)
        - Events with no summary
        - Potentially other noise

        Args:
            events: Raw list of events

        Returns:
            Filtered list of relevant events
        """
        filtered = []

        for event in events:
            # Skip cancelled events
            if event.get('status') == 'cancelled':
                continue

            # Skip events without a title
            if not event.get('summary'):
                continue

            # Skip all-day birthdays (auto-generated, not user patterns)
            if (event.get('eventType') == 'birthday' and
                'date' in event.get('start', {})):
                continue

            # Keep all other events
            filtered.append(event)

        return filtered

    def _deduplicate_events(self, events: List[Dict]) -> List[Dict]:
        """
        Remove duplicate events based on event ID.

        Args:
            events: List of events that may contain duplicates

        Returns:
            Deduplicated list
        """
        seen_ids = set()
        unique_events = []

        for event in events:
            event_id = event.get('id')
            if event_id and event_id not in seen_ids:
                seen_ids.add(event_id)
                unique_events.append(event)

        return unique_events

    def _is_in_range(self, event: Dict, start_time: str, end_time: str) -> bool:
        """
        Check if event falls within a time range.

        Args:
            event: Event dictionary
            start_time: Start of range (ISO format)
            end_time: End of range (ISO format)

        Returns:
            True if event is in range
        """
        event_start = event.get('start', {})

        # Get the start time (could be dateTime or date)
        event_time_str = event_start.get('dateTime') or event_start.get('date')

        if not event_time_str:
            return False

        try:
            # Parse times for comparison
            event_time = datetime.fromisoformat(event_time_str.replace('Z', '+00:00'))
            start = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            end = datetime.fromisoformat(end_time.replace('Z', '+00:00'))

            return start <= event_time <= end

        except (ValueError, AttributeError):
            return False

    def _calculate_date_ago(self, months: int = None, days: int = None) -> str:
        """
        Calculate date N months or days ago in ISO format with 'Z' suffix.

        Args:
            months: Number of months to go back (optional)
            days: Number of days to go back (optional)

        Returns:
            ISO formatted date string with 'Z' suffix

        Raises:
            ValueError: If neither months nor days is specified
        """
        now = datetime.utcnow()

        if days is not None:
            past_date = now - timedelta(days=days)
        elif months is not None:
            # Approximate: 30 days per month (good enough for sampling)
            days_ago = months * 30
            past_date = now - timedelta(days=days_ago)
        else:
            raise ValueError("Must specify either months or days parameter")

        return past_date.isoformat() + 'Z'

    def get_collection_stats(self, events: List[Dict]) -> Dict:
        """
        Generate statistics about collected events.
        Useful for debugging and user feedback.

        Args:
            events: List of collected events

        Returns:
            Dictionary with statistics
        """
        if not events:
            return {
                'total_events': 0,
                'date_range': None,
                'event_types': {},
                'has_descriptions': 0,
                'has_locations': 0,
                'has_colors': 0,
                'recurring_events': 0
            }

        # Count various attributes
        has_descriptions = sum(1 for e in events if e.get('description'))
        has_locations = sum(1 for e in events if e.get('location'))
        has_colors = sum(1 for e in events if e.get('colorId'))
        recurring = sum(1 for e in events if e.get('recurrence'))

        # Event types
        event_types = {}
        for event in events:
            event_type = event.get('eventType', 'default')
            event_types[event_type] = event_types.get(event_type, 0) + 1

        # Date range
        dates = []
        for event in events:
            start = event.get('start', {})
            date_str = start.get('dateTime') or start.get('date')
            if date_str:
                try:
                    # Handle both datetime (with timezone) and date (all-day events)
                    dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    # Make timezone-aware if naive (for all-day events)
                    if dt.tzinfo is None:
                        from datetime import timezone
                        dt = dt.replace(tzinfo=timezone.utc)
                    dates.append(dt)
                except ValueError:
                    pass

        date_range = None
        if dates:
            date_range = {
                'earliest': min(dates).isoformat(),
                'latest': max(dates).isoformat()
            }

        return {
            'total_events': len(events),
            'date_range': date_range,
            'event_types': event_types,
            'has_descriptions': has_descriptions,
            'has_locations': has_locations,
            'has_colors': has_colors,
            'recurring_events': recurring,
            'description_coverage': f"{(has_descriptions/len(events)*100):.1f}%",
            'location_coverage': f"{(has_locations/len(events)*100):.1f}%",
            'color_coverage': f"{(has_colors/len(events)*100):.1f}%"
        }

    def collect_comprehensive_data(self) -> Dict:
        """
        Collect comprehensive data for personalization analysis.
        Includes events, user settings, color definitions, and calendar list.

        This is the main method for one-time comprehensive learning.

        Returns:
            Dictionary with:
            - events: List of all events from last year
            - settings: User preferences (timezone, defaultEventLength, etc.)
            - colors: Color palette definitions
            - calendars: List of all calendars user has
            - stats: Statistics about collected data
        """

        result = {}

        # 1. Fetch all events from last year
        events = self.collect_for_analysis(mode='comprehensive')
        result['events'] = events

        # 2. Fetch user settings
        try:
            settings = self.calendar_service.get_settings()
            result['settings'] = settings
        except Exception as e:
            result['settings'] = {}

        # 3. Fetch color definitions
        try:
            colors = self.calendar_service.get_colors()
            result['colors'] = colors
            event_colors = colors.get('event', {})
        except Exception as e:
            result['colors'] = {}

        # 4. Fetch calendar list
        try:
            calendars = self.calendar_service.get_calendar_list()
            result['calendars'] = calendars
        except Exception as e:
            result['calendars'] = []

        # 5. Generate statistics
        result['stats'] = self.get_collection_stats(events)


        return result
