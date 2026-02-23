"""
Validation utilities for extraction pipeline.
Shared validators and helper functions.
"""

import re
from datetime import datetime
from typing import Optional, Tuple
import pytz


def is_valid_iso_date(date_str: str) -> bool:
    """
    Check if string is valid YYYY-MM-DD date.

    Args:
        date_str: Date string to validate

    Returns:
        True if valid ISO date format, False otherwise

    Examples:
        >>> is_valid_iso_date("2026-02-05")
        True
        >>> is_valid_iso_date("02/05/2026")
        False
    """
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
        return False
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        return True
    except ValueError:
        return False


def is_valid_time(time_str: str) -> bool:
    """
    Check if string is valid HH:MM:SS time.

    Args:
        time_str: Time string to validate

    Returns:
        True if valid 24-hour time format, False otherwise

    Examples:
        >>> is_valid_time("14:30:00")
        True
        >>> is_valid_time("2:30 PM")
        False
    """
    return bool(re.match(r'^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$', time_str))


def is_valid_iana_timezone(tz_str: str) -> bool:
    """
    Check if string is valid IANA timezone.

    Args:
        tz_str: Timezone string to validate

    Returns:
        True if valid IANA timezone, False otherwise

    Examples:
        >>> is_valid_iana_timezone("America/New_York")
        True
        >>> is_valid_iana_timezone("EST")
        False
    """
    try:
        pytz.timezone(tz_str)
        return True
    except pytz.exceptions.UnknownTimeZoneError:
        return False


def is_valid_iso8601_datetime(dt_str: str) -> bool:
    """
    Check if string is valid ISO 8601 datetime with timezone.

    Args:
        dt_str: Datetime string to validate

    Returns:
        True if valid ISO 8601 with timezone, False otherwise

    Examples:
        >>> is_valid_iso8601_datetime("2026-02-05T14:00:00-05:00")
        True
        >>> is_valid_iso8601_datetime("2026-02-05 14:00:00")
        False
    """
    iso_pattern = r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$'
    if not re.match(iso_pattern, dt_str):
        return False

    try:
        if dt_str.endswith('Z'):
            datetime.strptime(dt_str[:-1], '%Y-%m-%dT%H:%M:%S')
        else:
            date_time_part = dt_str[:19]
            datetime.strptime(date_time_part, '%Y-%m-%dT%H:%M:%S')
        return True
    except ValueError:
        return False


def validate_rrule_basic(rrule: str) -> Tuple[bool, Optional[str]]:
    """
    Basic validation of RRULE format.
    Checks for RRULE prefix, FREQ parameter, and BYDAY codes.

    Args:
        rrule: RRULE string to validate

    Returns:
        Tuple of (is_valid, error_message)
        error_message is None if valid

    Examples:
        >>> validate_rrule_basic("RRULE:FREQ=WEEKLY;BYDAY=TU,TH")
        (True, None)
        >>> validate_rrule_basic("FREQ=WEEKLY")
        (False, "RRULE must start with 'RRULE:'")
    """
    if not rrule.startswith('RRULE:'):
        return False, "RRULE must start with 'RRULE:'"

    rrule_content = rrule[6:]

    if 'FREQ=' not in rrule_content:
        return False, "RRULE must contain FREQ parameter"

    valid_freq = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']
    freq_match = re.search(r'FREQ=(\w+)', rrule_content)
    if freq_match:
        freq_value = freq_match.group(1)
        if freq_value not in valid_freq:
            return False, f"Invalid FREQ value '{freq_value}'"

    if 'BYDAY=' in rrule_content:
        valid_days = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
        byday_match = re.search(r'BYDAY=([A-Z,0-9]+)', rrule_content)
        if byday_match:
            days = byday_match.group(1).split(',')
            for day in days:
                # Remove any numeric prefix (e.g., "2TU" -> "TU")
                day_code = re.sub(r'^\d+', '', day)
                if day_code not in valid_days:
                    return False, f"Invalid BYDAY code '{day}'"

    return True, None


def truncate_title(title: str, max_length: int | None = None) -> str:
    """
    Truncate title to max length with ellipsis.

    Args:
        title: Title string to truncate
        max_length: Maximum length (default from TextLimits.EVENT_TITLE_MAX_LENGTH)

    Returns:
        Truncated title string

    Examples:
        >>> truncate_title("Short title")
        "Short title"
        >>> truncate_title("A" * 150)
        "A...A..." # 100 chars total
    """
    if max_length is None:
        from config.limits import TextLimits
        max_length = TextLimits.EVENT_TITLE_MAX_LENGTH
    if len(title) <= max_length:
        return title
    return title[:max_length-3] + "..."


def count_words(text: str) -> int:
    """
    Count words in text.

    Args:
        text: Text to count words in

    Returns:
        Number of words

    Examples:
        >>> count_words("Hello world")
        2
        >>> count_words("Hello   world  test")
        3
    """
    return len(text.split())
