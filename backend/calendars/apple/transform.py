"""
Apple Calendar format transformations.
Converts between iCalendar (VEVENT) format and universal (Google Calendar) format.
"""

from typing import Dict, Any, List, Optional
from icalendar import Calendar, Event as ICalEvent
from datetime import datetime
import pytz


def to_universal(ical_event: ICalEvent) -> Dict[str, Any]:
    """
    Convert iCalendar VEVENT to universal format (Google Calendar format).

    Args:
        ical_event: icalendar.Event instance

    Returns:
        Event dict in universal (Google Calendar) format
    """
    # Extract basic fields
    universal_event = {
        'summary': str(ical_event.get('SUMMARY', '')),
        'description': str(ical_event.get('DESCRIPTION', '')),
        'status': str(ical_event.get('STATUS', 'CONFIRMED')).lower()
    }

    # Add UID if present
    if ical_event.get('UID'):
        universal_event['id'] = str(ical_event.get('UID'))

    # Convert location
    if ical_event.get('LOCATION'):
        universal_event['location'] = str(ical_event.get('LOCATION'))

    # Convert start time
    dtstart = ical_event.get('DTSTART')
    if dtstart:
        dt = dtstart.dt
        if isinstance(dt, datetime):
            # Has time component
            universal_event['start'] = {
                'dateTime': dt.isoformat(),
                'timeZone': str(dt.tzinfo) if dt.tzinfo else 'UTC'
            }
        else:
            # Date only (all-day event)
            universal_event['start'] = {
                'date': dt.isoformat()
            }

    # Convert end time
    dtend = ical_event.get('DTEND')
    if dtend:
        dt = dtend.dt
        if isinstance(dt, datetime):
            # Has time component
            universal_event['end'] = {
                'dateTime': dt.isoformat(),
                'timeZone': str(dt.tzinfo) if dt.tzinfo else 'UTC'
            }
        else:
            # Date only (all-day event)
            universal_event['end'] = {
                'date': dt.isoformat()
            }

    # Recurrence rules
    if ical_event.get('RRULE'):
        rrule = ical_event.get('RRULE')
        # Convert RRULE to RRULE string format
        universal_event['recurrence'] = [f'RRULE:{rrule.to_ical().decode()}']

    return universal_event


def from_universal(universal_event: Dict[str, Any]) -> Calendar:
    """
    Convert universal format (Google Calendar) to iCalendar format.

    Args:
        universal_event: Event dict in universal (Google Calendar) format

    Returns:
        icalendar.Calendar object containing the event
    """
    # Create calendar and event
    cal = Calendar()
    cal.add('prodid', '-//DropCal//Apple Calendar Integration//EN')
    cal.add('version', '2.0')

    event = ICalEvent()

    # Add basic fields
    event.add('summary', universal_event.get('summary', ''))

    if universal_event.get('description'):
        event.add('description', universal_event.get('description'))

    if universal_event.get('location'):
        event.add('location', universal_event.get('location'))

    # Add status
    status = universal_event.get('status', 'confirmed').upper()
    event.add('status', status)

    # Add UID if present
    if universal_event.get('id'):
        event.add('uid', universal_event['id'])
    else:
        # Generate UID if not present
        import uuid
        event.add('uid', str(uuid.uuid4()))

    # Convert start time
    start = universal_event.get('start', {})
    if 'dateTime' in start:
        # Has time component
        dt = datetime.fromisoformat(start['dateTime'].replace('Z', '+00:00'))
        event.add('dtstart', dt)
    elif 'date' in start:
        # Date only (all-day event)
        from datetime import date
        dt = date.fromisoformat(start['date'])
        event.add('dtstart', dt)

    # Convert end time
    end = universal_event.get('end', {})
    if 'dateTime' in end:
        # Has time component
        dt = datetime.fromisoformat(end['dateTime'].replace('Z', '+00:00'))
        event.add('dtend', dt)
    elif 'date' in end:
        # Date only (all-day event)
        from datetime import date
        dt = date.fromisoformat(end['date'])
        event.add('dtend', dt)

    # Convert recurrence (RRULE → iCalendar RRULE property)
    recurrence_rules = universal_event.get('recurrence')
    if recurrence_rules:
        for rule in recurrence_rules:
            rrule_str = rule
            if rrule_str.startswith('RRULE:'):
                rrule_str = rrule_str[6:]
            try:
                rrule_dict = _parse_rrule_string(rrule_str)
                event.add('rrule', rrule_dict)
            except Exception as e:
                print(f"Warning: Could not add RRULE '{rrule_str}': {e}")

    # Add timestamp
    event.add('dtstamp', datetime.now(pytz.UTC))

    # Add event to calendar
    cal.add_component(event)

    return cal


def parse_ical_string(ical_string: str) -> List[Dict[str, Any]]:
    """
    Parse iCalendar string and convert all events to universal format.

    Args:
        ical_string: iCalendar format string

    Returns:
        List of events in universal format
    """
    try:
        cal = Calendar.from_ical(ical_string)
        events = []

        for component in cal.walk():
            if component.name == 'VEVENT':
                try:
                    universal_event = to_universal(component)
                    events.append(universal_event)
                except Exception as e:
                    print(f"Error parsing iCal event: {e}")
                    continue

        return events

    except Exception as e:
        print(f"Error parsing iCalendar string: {e}")
        return []


def _parse_rrule_string(rrule_str: str) -> Dict[str, Any]:
    """
    Parse an RRULE parameter string into a dict suitable for icalendar's event.add('rrule', ...).

    The icalendar library expects a dict like:
        {'freq': 'weekly', 'byday': ['MO', 'WE'], 'interval': 2}

    Args:
        rrule_str: RRULE parameters without the "RRULE:" prefix,
                   e.g. "FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=2"

    Returns:
        Dict for icalendar's rrule property
    """
    result = {}

    for part in rrule_str.split(';'):
        if '=' not in part:
            continue
        key, value = part.split('=', 1)
        key = key.strip().upper()

        if key == 'FREQ':
            result['freq'] = value.lower()
        elif key == 'INTERVAL':
            result['interval'] = int(value)
        elif key == 'COUNT':
            result['count'] = int(value)
        elif key == 'UNTIL':
            # Parse UNTIL date: YYYYMMDD or YYYYMMDDTHHMMSSZ
            if len(value) == 8:
                result['until'] = datetime(int(value[:4]), int(value[4:6]), int(value[6:8]),
                                           tzinfo=pytz.UTC)
            elif len(value) >= 15:
                result['until'] = datetime(int(value[:4]), int(value[4:6]), int(value[6:8]),
                                           int(value[9:11]), int(value[11:13]), int(value[13:15]),
                                           tzinfo=pytz.UTC)
        elif key == 'BYDAY':
            result['byday'] = value.split(',')
        elif key == 'BYMONTHDAY':
            result['bymonthday'] = int(value)
        elif key == 'BYMONTH':
            result['bymonth'] = int(value)

    return result
