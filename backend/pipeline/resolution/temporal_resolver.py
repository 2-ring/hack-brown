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
from typing import Optional, Tuple, List

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

# Regex to strip UNTIL from RRULE strings (LLM may include it despite instructions)
_UNTIL_PATTERN = re.compile(r';?UNTIL=[^;]+', re.IGNORECASE)


def resolve_temporal(
    extracted: ExtractedEvent,
    user_timezone: str = "America/New_York",
    reference_time: Optional[datetime] = None,
) -> CalendarEvent:
    """
    Convert an ExtractedEvent to a CalendarEvent by resolving temporal
    expressions via Duckling.

    Handles all combinations:
    - Timed single-day: start_date + start_time (+ optional end_time)
    - Timed multi-day: start_date + start_time + end_date (+ optional end_time)
    - All-day single: start_date only
    - All-day multi-day: start_date + end_date
    - Recurring: start_date + recurrence (+ optional end_date → UNTIL)
    - Recurring with exclusions: excluded_dates → EXDATE entries
    """
    tz_obj = pytz.timezone(user_timezone)
    now = reference_time or datetime.now(tz_obj)
    if now.tzinfo is None:
        now = tz_obj.localize(now)

    client = _get_client()

    # ── Resolve start date ────────────────────────────────────────────
    start_resolved = _resolve_date(extracted.start_date, client, tz_obj, now)
    if start_resolved is None:
        raise ValueError(
            f"Could not resolve start_date: '{extracted.start_date}'"
        )

    # ── Resolve end date (if provided) ────────────────────────────────
    end_date_resolved = None
    if extracted.end_date:
        end_date_resolved = _resolve_date(extracted.end_date, client, tz_obj, now)
        if end_date_resolved is None:
            logger.warning(
                f"Could not resolve end_date '{extracted.end_date}', ignoring"
            )

    # ── Resolve start/end times (if provided) ─────────────────────────
    start_time_resolved = None
    if extracted.start_time:
        start_time_resolved = _resolve_time(
            extracted.start_time, client, tz_obj, now
        )
        if start_time_resolved is None:
            logger.warning(
                f"Could not resolve start_time '{extracted.start_time}', "
                f"treating as all-day"
            )

    end_time_resolved = None
    if extracted.end_time:
        end_time_resolved = _resolve_time(
            extracted.end_time, client, tz_obj, now
        )
        if end_time_resolved is None:
            logger.warning(
                f"Could not resolve end_time '{extracted.end_time}', ignoring"
            )

    # ── Build CalendarDateTime start/end ──────────────────────────────
    is_all_day = extracted.is_all_day or start_time_resolved is None
    tz_name = str(tz_obj)

    if is_all_day:
        start_dt, end_dt = _build_all_day(
            start_resolved, end_date_resolved
        )
    else:
        start_dt, end_dt = _build_timed(
            start_resolved, end_date_resolved,
            start_time_resolved, end_time_resolved,
            tz_obj, tz_name,
        )

    # ── Build recurrence (RRULE + UNTIL from end_date + EXDATE) ───────
    recurrence = _build_recurrence(
        extracted.recurrence,
        extracted.excluded_dates,
        end_date_resolved,
        is_all_day,
        start_dt,
        user_timezone,
        tz_obj,
        now,
        client,
    )

    # If recurring with end_date, don't also set end on the event itself —
    # end_date becomes UNTIL in the RRULE, not the event's end datetime
    if recurrence and end_date_resolved and not extracted.end_time:
        end_dt = None

    return CalendarEvent(
        summary=extracted.summary,
        start=start_dt,
        end=end_dt,
        location=extracted.location,
        description=extracted.description,
        recurrence=recurrence,
    )


# =====================================================================
# Date / time resolution helpers
# =====================================================================

def _resolve_date(
    text: Optional[str],
    client: DucklingClient,
    tz_obj,
    now: datetime,
) -> Optional[datetime]:
    """Resolve a natural language date string to a datetime via Duckling."""
    if not text or not text.strip():
        return None
    return _duckling_parse_datetime(text.strip(), client, tz_obj, now)


def _resolve_time(
    text: Optional[str],
    client: DucklingClient,
    tz_obj,
    now: datetime,
) -> Optional[datetime]:
    """Resolve a natural language time string to a datetime via Duckling.

    Returns a datetime whose .time() component is the resolved time.
    The date component should be ignored (use _resolve_date for that).
    """
    if not text or not text.strip():
        return None
    return _duckling_parse_datetime(text.strip(), client, tz_obj, now)


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


# =====================================================================
# CalendarDateTime builders
# =====================================================================

def _build_all_day(
    start: datetime,
    end_date: Optional[datetime],
) -> Tuple[CalendarDateTime, CalendarDateTime]:
    """Build CalendarDateTime pair for all-day events.

    Google Calendar convention: end date is exclusive (day after last day).
    Single day: start=Mar 20, end=Mar 21
    Multi-day:  start=Mar 20, end=Mar 23 (for a Mar 20-22 event)
    """
    start_str = start.strftime("%Y-%m-%d")

    if end_date:
        # end_date is inclusive (the last day), add 1 for Google's exclusive end
        end_exclusive = end_date.date() + timedelta(days=1)
    else:
        # Single all-day event: end = start + 1 day
        end_exclusive = start.date() + timedelta(days=1)

    return (
        CalendarDateTime(date=start_str),
        CalendarDateTime(date=end_exclusive.strftime("%Y-%m-%d")),
    )


def _build_timed(
    start_date: datetime,
    end_date: Optional[datetime],
    start_time: datetime,
    end_time: Optional[datetime],
    tz_obj,
    tz_name: str,
) -> Tuple[CalendarDateTime, Optional[CalendarDateTime]]:
    """Build CalendarDateTime pair for timed events.

    Combines date and time components. Handles:
    - Same-day events (start_date + start_time, optionally + end_time)
    - Multi-day timed events (start_date + start_time → end_date + end_time)
    - Overnight events (end_time < start_time → rolls to next day)
    """
    # Combine start date + start time
    start = tz_obj.localize(
        datetime.combine(start_date.date(), start_time.time())
    )
    start_dt = CalendarDateTime(
        dateTime=_format_iso8601(start),
        timeZone=tz_name,
    )

    # No end time → no end CalendarDateTime (PERSONALIZE may infer later)
    if not end_time:
        return start_dt, None

    # Determine which date to use for end
    if end_date:
        # Multi-day timed event: end_date + end_time
        end = tz_obj.localize(
            datetime.combine(end_date.date(), end_time.time())
        )
    else:
        # Same-day: use start's date + end_time
        end = tz_obj.localize(
            datetime.combine(start_date.date(), end_time.time())
        )
        # Overnight: if end <= start, roll forward one day
        if end <= start:
            end += timedelta(days=1)

    end_dt = CalendarDateTime(
        dateTime=_format_iso8601(end),
        timeZone=tz_name,
    )
    return start_dt, end_dt


# =====================================================================
# Recurrence handling
# =====================================================================

def _build_recurrence(
    rrule_list: Optional[List[str]],
    excluded_dates: Optional[List[str]],
    end_date_resolved: Optional[datetime],
    is_all_day: bool,
    start_dt: CalendarDateTime,
    user_timezone: str,
    tz_obj,
    now: datetime,
    client: DucklingClient,
) -> Optional[List[str]]:
    """Build the final recurrence list: RRULE (with UNTIL) + EXDATE entries.

    - Strips any UNTIL the LLM may have included in the RRULE
    - Injects UNTIL from end_date (resolved via Duckling)
    - Converts excluded_dates to EXDATE entries
    """
    if not rrule_list:
        return None

    recurrence = []

    for rule in rrule_list:
        if rule.startswith("RRULE:"):
            rule = _inject_until(rule, end_date_resolved, is_all_day, tz_obj)
        recurrence.append(rule)

    # Add EXDATE entries for excluded dates
    if excluded_dates:
        _append_exdates(
            recurrence, excluded_dates, is_all_day,
            start_dt, user_timezone, tz_obj, now, client,
        )

    return recurrence if recurrence else None


def _inject_until(
    rrule: str,
    end_date: Optional[datetime],
    is_all_day: bool,
    tz_obj,
) -> str:
    """Strip any existing UNTIL from an RRULE and inject one from end_date.

    UNTIL is always UTC per RFC 5545 (for timed events).
    For all-day events, UNTIL is a DATE value (YYYYMMDD).
    """
    # Strip existing UNTIL (LLM may include it despite instructions)
    cleaned = _UNTIL_PATTERN.sub('', rrule)
    # Clean up any resulting double semicolons
    cleaned = re.sub(r';{2,}', ';', cleaned).rstrip(';')

    if not end_date:
        return cleaned

    # Build UNTIL value
    if is_all_day:
        until_str = end_date.strftime('%Y%m%d')
    else:
        # Convert to UTC for UNTIL (RFC 5545 requirement)
        end_utc = end_date.astimezone(pytz.UTC)
        # Use end of day so the last occurrence is included
        end_of_day = end_utc.replace(hour=23, minute=59, second=59)
        until_str = end_of_day.strftime('%Y%m%dT%H%M%SZ')

    # Append UNTIL to the RRULE body
    return f"{cleaned};UNTIL={until_str}"


def _append_exdates(
    recurrence: list,
    excluded_dates: list,
    is_all_day: bool,
    start_dt: CalendarDateTime,
    user_timezone: str,
    tz_obj,
    now: datetime,
    client: DucklingClient,
) -> None:
    """Convert natural language excluded_dates into iCalendar EXDATE entries
    and append them to the recurrence list.

    For timed events: EXDATE;TZID=America/New_York:20260323T100000
    For all-day events: EXDATE;VALUE=DATE:20260323
    """
    for date_str in excluded_dates:
        if not date_str or not date_str.strip():
            continue

        exc_dt = _duckling_parse_datetime(date_str.strip(), client, tz_obj, now)
        if exc_dt is None:
            logger.warning(f"Could not resolve excluded date: '{date_str}'")
            continue

        if is_all_day:
            recurrence.append(
                f"EXDATE;VALUE=DATE:{exc_dt.strftime('%Y%m%d')}"
            )
        else:
            # Combine excluded date with event's start time
            if start_dt.dateTime:
                start_time = datetime.fromisoformat(
                    start_dt.dateTime[:19]
                ).time()
            else:
                # Fallback: midnight
                start_time = datetime.min.time()

            exc_full = tz_obj.localize(
                datetime.combine(exc_dt.date(), start_time)
            )
            recurrence.append(
                f"EXDATE;TZID={user_timezone}:"
                f"{exc_full.strftime('%Y%m%dT%H%M%S')}"
            )


# =====================================================================
# Formatting
# =====================================================================

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
