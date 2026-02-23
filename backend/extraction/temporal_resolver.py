"""
RESOLVE stage — deterministic temporal resolution.

Converts ExtractedEvent (with NL date/time strings) into CalendarEvent
(with ISO 8601 CalendarDateTime) using Duckling for parsing.

Only resolves fields that were explicitly extracted. If a field is None,
it stays None for PERSONALIZE to handle later.

Usage:
    from extraction.temporal_resolver import resolve_temporal

    extracted = extractor.execute(...)  # Returns List[ExtractedEvent]
    calendar_event = resolve_temporal(extracted[0], user_timezone="America/New_York")
"""

import logging
import re
from datetime import datetime, timedelta
from typing import Optional, Tuple

import pytz

from extraction.models import ExtractedEvent, CalendarEvent, CalendarDateTime
from extraction.duckling_client import DucklingClient, DucklingError

logger = logging.getLogger(__name__)

# Singleton client — reused across calls
_duckling_client: Optional[DucklingClient] = None


def _get_client() -> DucklingClient:
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


def resolve_temporal(
    extracted: ExtractedEvent,
    user_timezone: str = "America/New_York",
    reference_time: Optional[datetime] = None,
) -> CalendarEvent:
    """
    Convert an ExtractedEvent to a CalendarEvent by resolving temporal
    expressions via Duckling.

    Args:
        extracted: EXTRACT output with NL date/time strings.
        user_timezone: User's IANA timezone from their profile.
        reference_time: Override "now" for testing.

    Returns:
        CalendarEvent with resolved start (and optionally end) CalendarDateTime.

    Raises:
        ValueError: If the date cannot be resolved at all.
    """
    tz_obj = pytz.timezone(user_timezone)
    now = reference_time or datetime.now(tz_obj)
    if now.tzinfo is None:
        now = tz_obj.localize(now)

    client = _get_client()

    if extracted.is_all_day:
        start_dt, end_dt = _resolve_all_day(extracted, tz_obj, now, client)
    else:
        start_dt, end_dt = _resolve_timed(extracted, tz_obj, now, client)

    # Build recurrence list, converting excluded_dates to EXDATE entries
    recurrence = list(extracted.recurrence) if extracted.recurrence else None
    if extracted.excluded_dates and recurrence:
        recurrence = _add_exdates(
            recurrence, extracted.excluded_dates, extracted.is_all_day,
            start_dt, user_timezone, tz_obj, now, client,
        )

    return CalendarEvent(
        summary=extracted.summary,
        start=start_dt,
        end=end_dt,
        location=extracted.location,
        description=extracted.description,
        recurrence=recurrence,
    )


def _duckling_parse_datetime(
    text: str,
    client: DucklingClient,
    tz_obj,
    now: datetime,
) -> Optional[datetime]:
    """Parse a datetime expression via Duckling."""
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

    # Take the first non-latent result
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
        from_val = value.get("from", {})
        return _parse_duckling_value(from_val.get("value"), tz_obj)

    return None


def _parse_duckling_value(iso_str: Optional[str], tz_obj) -> Optional[datetime]:
    """Parse a Duckling ISO 8601 value string into a timezone-aware datetime."""
    if not iso_str:
        return None

    try:
        clean = re.sub(r'\.\d{3}', '', iso_str)
        dt = datetime.fromisoformat(clean)

        if dt.tzinfo is not None:
            return dt.astimezone(tz_obj)
        else:
            return tz_obj.localize(dt)
    except (ValueError, TypeError) as e:
        logger.warning(f"Could not parse Duckling datetime '{iso_str}': {e}")
        return None


def _add_exdates(
    recurrence: list,
    excluded_dates: list,
    is_all_day: bool,
    start_dt: CalendarDateTime,
    user_timezone: str,
    tz_obj,
    now: datetime,
    client: DucklingClient,
) -> list:
    """
    Convert natural language excluded_dates into iCalendar EXDATE entries
    and append them to the recurrence list.

    For timed events: EXDATE;TZID=America/New_York:20260323T100000
    For all-day events: EXDATE;VALUE=DATE:20260323
    """
    for date_str in excluded_dates:
        exc_dt = _duckling_parse_datetime(date_str, client, tz_obj, now)
        if exc_dt is None:
            logger.warning(f"Could not resolve excluded date: '{date_str}'")
            continue

        if is_all_day:
            recurrence.append(
                f"EXDATE;VALUE=DATE:{exc_dt.strftime('%Y%m%d')}"
            )
        else:
            # Combine excluded date with event's start time
            start_time = datetime.fromisoformat(
                start_dt.dateTime[:19]
            ).time()
            exc_full = tz_obj.localize(
                datetime.combine(exc_dt.date(), start_time)
            )
            recurrence.append(
                f"EXDATE;TZID={user_timezone}:{exc_full.strftime('%Y%m%dT%H%M%S')}"
            )

    return recurrence


def _resolve_all_day(
    extracted: ExtractedEvent,
    tz_obj,
    now: datetime,
    client: DucklingClient,
) -> Tuple[CalendarDateTime, Optional[CalendarDateTime]]:
    """Resolve an all-day event to CalendarDateTime pair (date-only format)."""
    if not extracted.date:
        raise ValueError("All-day event has no date")

    start = _duckling_parse_datetime(extracted.date, client, tz_obj, now)
    if start is None:
        raise ValueError(f"Could not resolve date: '{extracted.date}'")

    start_date_str = start.strftime("%Y-%m-%d")

    # Single all-day event: end = start + 1 day (Google Calendar convention)
    end_date = start.date() + timedelta(days=1)
    end_dt = CalendarDateTime(date=end_date.strftime("%Y-%m-%d"))

    return (
        CalendarDateTime(date=start_date_str),
        end_dt,
    )


def _resolve_timed(
    extracted: ExtractedEvent,
    tz_obj,
    now: datetime,
    client: DucklingClient,
) -> Tuple[CalendarDateTime, Optional[CalendarDateTime]]:
    """Resolve a timed event to CalendarDateTime pair."""
    tz_name = str(tz_obj)

    date_part = extracted.date or ""
    time_part = extracted.start_time or ""

    # Try combined parse first: "next Tuesday at 3pm"
    combined = f"{date_part} {time_part}".strip() if date_part and time_part else (date_part or time_part)

    start = None
    if combined:
        start = _duckling_parse_datetime(combined, client, tz_obj, now)

    # If combined failed, try date and time separately
    if start is None and date_part and time_part:
        date_dt = _duckling_parse_datetime(date_part, client, tz_obj, now)
        time_dt = _duckling_parse_datetime(time_part, client, tz_obj, now)
        if date_dt and time_dt:
            start = tz_obj.localize(
                datetime.combine(date_dt.date(), time_dt.time())
            )
        elif date_dt:
            start = date_dt

    if start is None:
        raise ValueError(
            f"Could not resolve start datetime from date='{extracted.date}', "
            f"time='{extracted.start_time}'"
        )

    start_dt = CalendarDateTime(
        dateTime=_format_iso8601(start),
        timeZone=tz_name,
    )

    # Resolve end time — ONLY if explicitly provided
    end_dt = None
    if extracted.end_time:
        end = _duckling_parse_datetime(extracted.end_time, client, tz_obj, now)
        if end:
            # Use start's date if only time was parsed
            if end.date() != start.date():
                end = tz_obj.localize(datetime.combine(start.date(), end.time()))

            # Handle overnight: if end is before start, roll forward one day
            if end <= start:
                end += timedelta(days=1)

            end_dt = CalendarDateTime(
                dateTime=_format_iso8601(end),
                timeZone=tz_name,
            )

    return start_dt, end_dt


def _format_iso8601(dt: datetime) -> str:
    """Format a timezone-aware datetime as ISO 8601 with offset."""
    if dt.tzinfo is None:
        raise ValueError("Cannot format naive datetime as ISO 8601")

    formatted = dt.strftime("%Y-%m-%dT%H:%M:%S")
    utc_offset = dt.strftime("%z")  # e.g., "-0500"

    if utc_offset:
        formatted += f"{utc_offset[:-2]}:{utc_offset[-2:]}"
    else:
        formatted += "+00:00"

    return formatted
