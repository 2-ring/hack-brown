"""
RRULE expansion utility for recurring event conflict detection.
Uses python-dateutil to expand RRULE strings into concrete occurrences.
"""

from datetime import datetime, timedelta
from typing import List, Tuple, Optional
from dateutil.rrule import rrulestr
from dateutil.relativedelta import relativedelta
from dateutil.parser import isoparse


MAX_OCCURRENCES = 200


def expand_rrule(
    rrule_strings: List[str],
    dtstart: datetime,
    duration: timedelta,
    horizon_months: int = 6
) -> List[Tuple[datetime, datetime]]:
    """
    Expand RRULE strings into concrete (start, end) occurrence pairs.

    Args:
        rrule_strings: List of RRULE strings (e.g., ["RRULE:FREQ=WEEKLY;BYDAY=MO"])
        dtstart: The start datetime of the first occurrence
        duration: Duration of each occurrence (end - start)
        horizon_months: How far into the future to expand (default 6 months)

    Returns:
        List of (start, end) datetime tuples for each occurrence
    """
    if not rrule_strings:
        return []

    horizon_end = dtstart + relativedelta(months=horizon_months)
    occurrences = []

    for rule_str in rrule_strings:
        if not rule_str.startswith('RRULE:'):
            continue

        try:
            rule = rrulestr(rule_str, dtstart=dtstart)

            for occ_start in rule.between(dtstart, horizon_end, inc=True):
                occurrences.append((occ_start, occ_start + duration))

                if len(occurrences) >= MAX_OCCURRENCES:
                    return occurrences
        except (ValueError, TypeError):
            continue

    return occurrences


def parse_event_times(event: dict) -> Optional[Tuple[datetime, datetime]]:
    """
    Parse start/end datetimes from an event dict.

    Args:
        event: Dict with 'start' and 'end' keys containing 'dateTime' strings

    Returns:
        (start, end) datetime tuple, or None if the event is all-day or unparseable
    """
    start = event.get('start', {})
    end = event.get('end', {})
    start_time = start.get('dateTime')
    end_time = end.get('dateTime')

    if not start_time or not end_time:
        return None

    try:
        return (isoparse(start_time), isoparse(end_time))
    except (ValueError, TypeError):
        return None


def times_overlap(
    start_a: datetime, end_a: datetime,
    start_b: datetime, end_b: datetime
) -> bool:
    """Check if two time ranges overlap."""
    return start_a < end_b and start_b < end_a
