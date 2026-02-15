"""
Deterministic temporal resolver.

Converts ExtractedEvent (Agent 2 output with natural language temporal expressions)
into CalendarEvent (with ISO 8601 CalendarDateTime) using Duckling for parsing.

The resolver ONLY converts what was explicitly extracted. If Agent 2 left a field
as None (e.g., no end time stated), the resolver does NOT infer a default.
Missing end times are left as None for Agent 3 to handle later.

Usage:
    from extraction.temporal_resolver import resolve_temporal

    extracted = agent_2.execute(...)  # Returns ExtractedEvent
    calendar_event = resolve_temporal(extracted, user_timezone="America/New_York")
"""

import logging
import re
from datetime import datetime, timedelta
from typing import Optional, Tuple

import pytz

from extraction.models import (
    ExtractedEvent, CalendarEvent, CalendarDateTime, TemporalExtraction
)
from extraction.duckling_client import DucklingClient, DucklingError

logger = logging.getLogger(__name__)

# Matches an explicit 4-digit year (2000-2099) in date text
_EXPLICIT_YEAR_RE = re.compile(r'\b20\d{2}\b')

# Singleton client — reused across calls
_duckling_client: Optional[DucklingClient] = None


def _get_client() -> DucklingClient:
    """Get or create the singleton Duckling client."""
    global _duckling_client
    if _duckling_client is None:
        _duckling_client = DucklingClient()
    return _duckling_client


# Timezone alias map: common abbreviations → IANA names
_TZ_ALIASES = {
    "est": "America/New_York",
    "edt": "America/New_York",
    "eastern": "America/New_York",
    "et": "America/New_York",
    "cst": "America/Chicago",
    "cdt": "America/Chicago",
    "central": "America/Chicago",
    "ct": "America/Chicago",
    "mst": "America/Denver",
    "mdt": "America/Denver",
    "mountain": "America/Denver",
    "mt": "America/Denver",
    "pst": "America/Los_Angeles",
    "pdt": "America/Los_Angeles",
    "pacific": "America/Los_Angeles",
    "pt": "America/Los_Angeles",
    "utc": "UTC",
    "gmt": "UTC",
}


def _enforce_year(dt: datetime, date_text: Optional[str], now: datetime) -> datetime:
    """
    Enforce the year convention: if date_text contains no explicit year,
    the intended year is the current year. Duckling defaults to the next
    future occurrence which can push past dates into next year.

    Only overrides when:
    - date_text has no 4-digit year (e.g., "January 28", not "January 28, 2027")
    - Duckling resolved to a different year than current
    """
    if not date_text or _EXPLICIT_YEAR_RE.search(date_text):
        return dt
    current_year = now.year
    if dt.year != current_year:
        try:
            dt = dt.replace(year=current_year)
        except ValueError:
            # Feb 29 in a non-leap year — use Feb 28
            dt = dt.replace(year=current_year, day=28)
        logger.debug(
            f"Year override: '{date_text}' resolved to {dt.year + (now.year - current_year)}, "
            f"forced to {current_year}"
        )
    return dt


def resolve_temporal(
    extracted: ExtractedEvent,
    user_timezone: str = "America/New_York",
    reference_time: Optional[datetime] = None,
) -> CalendarEvent:
    """
    Convert an ExtractedEvent to a CalendarEvent by resolving temporal expressions
    via Duckling.

    Only resolves fields that Agent 2 explicitly extracted. Does NOT infer
    missing end times or default durations — those are Agent 3's job.

    Args:
        extracted: Agent 2 output with NL temporal expressions.
        user_timezone: User's IANA timezone from their profile.
        reference_time: Override "now" for testing. Defaults to datetime.now().

    Returns:
        CalendarEvent with resolved start (and optionally end) CalendarDateTime.

    Raises:
        ValueError: If the date cannot be resolved at all.
        DucklingError: If Duckling service is unavailable.
    """
    temporal = extracted.temporal
    tz_name = _resolve_timezone(temporal.explicit_timezone, user_timezone)
    tz_obj = pytz.timezone(tz_name)

    now = reference_time or datetime.now(tz_obj)
    if now.tzinfo is None:
        now = tz_obj.localize(now)

    client = _get_client()

    if temporal.is_all_day:
        start_dt, end_dt = _resolve_all_day(temporal, tz_obj, now, client)
    else:
        start_dt, end_dt = _resolve_timed(temporal, tz_obj, now, client)

    return CalendarEvent(
        summary=extracted.summary,
        start=start_dt,
        end=end_dt,
        location=extracted.location,
        description=extracted.description,
        recurrence=extracted.recurrence,
        attendees=extracted.attendees,
        meeting_url=extracted.meeting_url,
        people=extracted.people,
        instructions=extracted.instructions,
        calendar=extracted.calendar,
        colorId=extracted.colorId,
    )


def _resolve_timezone(explicit_tz: Optional[str], user_tz: str) -> str:
    """Resolve explicit timezone text to IANA, falling back to user's timezone."""
    if not explicit_tz:
        return user_tz
    normalized = explicit_tz.strip().lower()
    if normalized in _TZ_ALIASES:
        return _TZ_ALIASES[normalized]
    # Try as direct IANA timezone
    try:
        pytz.timezone(explicit_tz)
        return explicit_tz
    except pytz.exceptions.UnknownTimeZoneError:
        logger.warning(f"Unknown timezone '{explicit_tz}', falling back to {user_tz}")
        return user_tz


def _duckling_parse_datetime(
    text: str,
    client: DucklingClient,
    tz_obj,
    now: datetime,
) -> Optional[datetime]:
    """
    Parse a datetime expression via Duckling, returning a timezone-aware datetime.

    Returns None if Duckling cannot parse the text or returns no results.
    """
    try:
        results = client.parse_time(
            text=text,
            reference_time=now,
            timezone=str(tz_obj),
        )
    except DucklingError as e:
        logger.error(f"Duckling error parsing '{text}': {e}")
        return None

    if not results:
        return None

    # Take the first non-latent result, or first result if all are latent
    result = None
    for r in results:
        if not r.get("latent", False):
            result = r
            break
    if result is None:
        result = results[0]

    value = result.get("value", {})
    val_type = value.get("type")

    if val_type == "value":
        return _parse_duckling_value(value.get("value"), tz_obj)
    elif val_type == "interval":
        # For intervals, return the start of the interval
        from_val = value.get("from", {})
        return _parse_duckling_value(from_val.get("value"), tz_obj)

    return None


def _duckling_parse_interval(
    text: str,
    client: DucklingClient,
    tz_obj,
    now: datetime,
) -> Optional[Tuple[datetime, datetime]]:
    """
    Parse a temporal interval via Duckling, returning (start, end) datetimes.

    Returns None if the expression doesn't represent an interval.
    """
    try:
        results = client.parse_time(
            text=text,
            reference_time=now,
            timezone=str(tz_obj),
        )
    except DucklingError as e:
        logger.error(f"Duckling error parsing interval '{text}': {e}")
        return None

    if not results:
        return None

    result = results[0]
    value = result.get("value", {})

    if value.get("type") == "interval":
        from_val = value.get("from", {})
        to_val = value.get("to", {})
        start = _parse_duckling_value(from_val.get("value"), tz_obj)
        end = _parse_duckling_value(to_val.get("value"), tz_obj)
        if start and end:
            return (start, end)

    return None


def _duckling_parse_duration_seconds(
    text: str,
    client: DucklingClient,
    now: datetime,
    timezone: str = "America/New_York",
) -> Optional[int]:
    """
    Parse a duration expression via Duckling, returning total seconds.

    Returns None if Duckling cannot parse the duration.
    """
    try:
        results = client.parse_duration(
            text=text,
            reference_time=now,
            timezone=timezone,
        )
    except DucklingError as e:
        logger.error(f"Duckling error parsing duration '{text}': {e}")
        return None

    if not results:
        return None

    value = results[0].get("value", {})
    normalized = value.get("normalized", {})
    if normalized and "value" in normalized:
        return int(normalized["value"])

    # Fallback: try to extract from the value field directly
    val = value.get("value")
    unit = value.get("unit")
    if val is not None and unit:
        multipliers = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}
        return int(val * multipliers.get(unit, 60))

    return None


def _parse_duckling_value(iso_str: Optional[str], tz_obj) -> Optional[datetime]:
    """Parse a Duckling ISO 8601 value string into a timezone-aware datetime."""
    if not iso_str:
        return None

    try:
        # Duckling returns ISO 8601 with timezone offset, e.g.:
        # "2026-02-17T15:00:00.000-05:00"
        # Strip milliseconds if present for consistent parsing
        clean = re.sub(r'\.\d{3}', '', iso_str)

        # Python's fromisoformat handles timezone offsets in 3.7+
        dt = datetime.fromisoformat(clean)

        # Convert to the target timezone
        if dt.tzinfo is not None:
            return dt.astimezone(tz_obj)
        else:
            return tz_obj.localize(dt)
    except (ValueError, TypeError) as e:
        logger.warning(f"Could not parse Duckling datetime '{iso_str}': {e}")
        return None


def _resolve_all_day(
    temporal: TemporalExtraction,
    tz_obj,
    now: datetime,
    client: DucklingClient,
) -> Tuple[CalendarDateTime, Optional[CalendarDateTime]]:
    """Resolve an all-day event to CalendarDateTime pair (date-only format)."""
    if not temporal.date_text:
        raise ValueError("All-day event has no date_text")

    start = _duckling_parse_datetime(temporal.date_text, client, tz_obj, now)
    if start is None:
        raise ValueError(f"Could not resolve date: '{temporal.date_text}'")
    start = _enforce_year(start, temporal.date_text, now)

    start_date_str = start.strftime("%Y-%m-%d")

    # Resolve end date
    end_dt = None
    if temporal.end_date_text:
        end = _duckling_parse_datetime(temporal.end_date_text, client, tz_obj, now)
        if end:
            end = _enforce_year(end, temporal.end_date_text, now)
            # Google Calendar all-day end date is exclusive (add 1 day)
            end_date = end.date() + timedelta(days=1)
            end_dt = CalendarDateTime(date=end_date.strftime("%Y-%m-%d"))
    elif temporal.is_multiday:
        # Multiday flag set but no end_date_text — leave None for Agent 3
        end_dt = None
    else:
        # Single all-day event: end = start + 1 day (Google Calendar convention)
        end_date = start.date() + timedelta(days=1)
        end_dt = CalendarDateTime(date=end_date.strftime("%Y-%m-%d"))

    return (
        CalendarDateTime(date=start_date_str),
        end_dt,
    )


def _resolve_timed(
    temporal: TemporalExtraction,
    tz_obj,
    now: datetime,
    client: DucklingClient,
) -> Tuple[CalendarDateTime, Optional[CalendarDateTime]]:
    """
    Resolve a timed event to CalendarDateTime pair.

    Only sets end if end_time_text or duration_text was explicitly provided.
    """
    tz_name = str(tz_obj)

    # Build combined expression for Duckling: "next Tuesday at 3pm"
    date_part = temporal.date_text or ""
    time_part = temporal.start_time_text or ""

    # Try combined parse first (handles "next Tuesday at 3pm" as one expression)
    combined = f"{date_part} {time_part}".strip() if date_part and time_part else (date_part or time_part)

    start = None
    if combined:
        start = _duckling_parse_datetime(combined, client, tz_obj, now)

    # If combined parse failed, try date and time separately
    if start is None and date_part and time_part:
        date_dt = _duckling_parse_datetime(date_part, client, tz_obj, now)
        time_dt = _duckling_parse_datetime(time_part, client, tz_obj, now)
        if date_dt and time_dt:
            # Combine: date from date_dt, time from time_dt
            start = tz_obj.localize(
                datetime.combine(date_dt.date(), time_dt.time())
            )
        elif date_dt:
            start = date_dt

    if start is None:
        raise ValueError(
            f"Could not resolve start datetime from date='{temporal.date_text}', "
            f"time='{temporal.start_time_text}'"
        )

    # Enforce year convention: no year in date_text = current year
    start = _enforce_year(start, temporal.date_text, now)

    start_dt = CalendarDateTime(
        dateTime=_format_iso8601(start),
        timeZone=tz_name,
    )

    # Resolve end time — ONLY if explicitly provided
    end_dt = _resolve_end_time(temporal, start, tz_obj, now, client, tz_name)

    return start_dt, end_dt


def _resolve_end_time(
    temporal: TemporalExtraction,
    start: datetime,
    tz_obj,
    now: datetime,
    client: DucklingClient,
    tz_name: str,
) -> Optional[CalendarDateTime]:
    """
    Resolve end time ONLY from explicitly provided information.

    Returns None if no end time or duration was stated.
    """
    # Case 1: Explicit end time text
    if temporal.end_time_text:
        end_date_part = temporal.end_date_text or ""
        end_time_part = temporal.end_time_text

        combined_end = f"{end_date_part} {end_time_part}".strip() if end_date_part else end_time_part
        end = _duckling_parse_datetime(combined_end, client, tz_obj, now)

        if end:
            # Enforce year convention on end date if end_date_text was provided
            if temporal.end_date_text:
                end = _enforce_year(end, temporal.end_date_text, now)
            # Use start's date if only time was parsed and no end_date_text
            if not temporal.end_date_text and end.date() != start.date():
                end = tz_obj.localize(datetime.combine(start.date(), end.time()))

            # Handle overnight: if end is before start, roll forward one day
            if end <= start:
                end += timedelta(days=1)

            return CalendarDateTime(
                dateTime=_format_iso8601(end),
                timeZone=tz_name,
            )

    # Case 2: Explicit duration text
    if temporal.duration_text:
        duration_secs = _duckling_parse_duration_seconds(
            temporal.duration_text, client, now, tz_name
        )
        if duration_secs and duration_secs > 0:
            end = start + timedelta(seconds=duration_secs)
            return CalendarDateTime(
                dateTime=_format_iso8601(end),
                timeZone=tz_name,
            )

    # Case 3: Nothing stated — leave None for Agent 3
    return None


def _format_iso8601(dt: datetime) -> str:
    """Format a timezone-aware datetime as ISO 8601 with offset."""
    # Ensure timezone-aware
    if dt.tzinfo is None:
        raise ValueError("Cannot format naive datetime as ISO 8601")

    # Format: 2026-02-17T15:00:00-05:00
    formatted = dt.strftime("%Y-%m-%dT%H:%M:%S")
    utc_offset = dt.strftime("%z")  # e.g., "-0500"

    # Insert colon into UTC offset: "-0500" → "-05:00"
    if utc_offset:
        formatted += f"{utc_offset[:-2]}:{utc_offset[-2:]}"
    else:
        formatted += "+00:00"

    return formatted
