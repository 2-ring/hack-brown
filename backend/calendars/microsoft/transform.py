"""
Microsoft Calendar format transformations.
Converts between Microsoft Graph API format and universal (Google Calendar) format.
"""

from typing import Dict, Any, List, Optional


def to_universal(ms_event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert Microsoft Graph event to universal format (Google Calendar format).

    Args:
        ms_event: Event dict from Microsoft Graph API

    Returns:
        Event dict in universal (Google Calendar) format
    """
    # Extract basic fields
    universal_event = {
        'id': ms_event.get('id'),
        'summary': ms_event.get('subject', ''),
        'description': ms_event.get('body', {}).get('content', ''),
        'status': 'confirmed' if not ms_event.get('isCancelled') else 'cancelled'
    }

    # Convert location
    location = ms_event.get('location', {})
    if location.get('displayName'):
        universal_event['location'] = location['displayName']

    # Convert start/end times
    start = ms_event.get('start', {})
    end = ms_event.get('end', {})

    if start:
        universal_event['start'] = {
            'dateTime': start.get('dateTime'),
            'timeZone': start.get('timeZone', 'UTC')
        }

    if end:
        universal_event['end'] = {
            'dateTime': end.get('dateTime'),
            'timeZone': end.get('timeZone', 'UTC')
        }

    # Recurrence (simplified)
    if ms_event.get('recurrence'):
        universal_event['recurrence'] = ['RRULE:' + str(ms_event.get('recurrence'))]

    # Other fields
    if ms_event.get('isAllDay'):
        # Convert to all-day event format
        universal_event['start'] = {'date': start.get('dateTime', '').split('T')[0]}
        universal_event['end'] = {'date': end.get('dateTime', '').split('T')[0]}

    return universal_event


def from_universal(universal_event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert universal format (Google Calendar) to Microsoft Graph event format.

    Args:
        universal_event: Event dict in universal (Google Calendar) format

    Returns:
        Event dict in Microsoft Graph API format
    """
    # Extract basic fields
    ms_event = {
        'subject': universal_event.get('summary', ''),
        'body': {
            'contentType': 'text',
            'content': universal_event.get('description', '')
        }
    }

    # Convert location
    if universal_event.get('location'):
        ms_event['location'] = {
            'displayName': universal_event['location']
        }

    # Convert start/end times
    start = universal_event.get('start', {})
    end = universal_event.get('end', {})

    # Check if all-day event (has 'date' instead of 'dateTime')
    is_all_day = 'date' in start

    if is_all_day:
        ms_event['isAllDay'] = True
        ms_event['start'] = {
            'dateTime': start.get('date') + 'T00:00:00',
            'timeZone': start.get('timeZone', 'UTC')
        }
        ms_event['end'] = {
            'dateTime': end.get('date') + 'T00:00:00',
            'timeZone': end.get('timeZone', 'UTC')
        }
    else:
        ms_event['isAllDay'] = False
        if start.get('dateTime'):
            ms_event['start'] = {
                'dateTime': start['dateTime'],
                'timeZone': start.get('timeZone', 'UTC')
            }
        if end.get('dateTime'):
            ms_event['end'] = {
                'dateTime': end['dateTime'],
                'timeZone': end.get('timeZone', 'UTC')
            }

    # Convert recurrence (RRULE → Microsoft Graph format)
    recurrence_rules = universal_event.get('recurrence')
    if recurrence_rules:
        ms_recurrence = _rrule_to_ms_recurrence(recurrence_rules, start)
        if ms_recurrence:
            ms_event['recurrence'] = ms_recurrence

    return ms_event


def _rrule_to_ms_recurrence(
    rrule_list: List[str],
    start: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Convert RRULE string(s) to Microsoft Graph recurrence object.

    Args:
        rrule_list: List of RRULE strings, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE"]
        start: Start date/time dict with 'dateTime' or 'date' key

    Returns:
        Microsoft Graph recurrence dict or None if parsing fails
    """
    import re

    if not rrule_list:
        return None

    # Parse the first RRULE (Microsoft only supports one recurrence pattern)
    rule = rrule_list[0]
    if rule.startswith('RRULE:'):
        rule = rule[6:]

    # Parse RRULE parameters into a dict
    params = {}
    for part in rule.split(';'):
        if '=' in part:
            key, value = part.split('=', 1)
            params[key] = value

    freq = params.get('FREQ', '')
    interval = int(params.get('INTERVAL', '1'))

    # Map RRULE day codes to Microsoft day names
    day_map = {
        'MO': 'monday', 'TU': 'tuesday', 'WE': 'wednesday',
        'TH': 'thursday', 'FR': 'friday', 'SA': 'saturday', 'SU': 'sunday'
    }

    # Build recurrence pattern
    pattern = {'interval': interval, 'firstDayOfWeek': 'sunday'}

    if freq == 'DAILY':
        pattern['type'] = 'daily'
    elif freq == 'WEEKLY':
        pattern['type'] = 'weekly'
        byday = params.get('BYDAY', '')
        if byday:
            pattern['daysOfWeek'] = [day_map[d] for d in byday.split(',') if d in day_map]
        else:
            # Default to the day of the start date
            start_dt = start.get('dateTime') or start.get('date', '')
            if start_dt:
                from datetime import datetime as dt
                try:
                    date_str = start_dt[:10]
                    day_idx = dt.strptime(date_str, '%Y-%m-%d').weekday()
                    days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
                    pattern['daysOfWeek'] = [days[day_idx]]
                except (ValueError, IndexError):
                    pattern['daysOfWeek'] = ['monday']
    elif freq == 'MONTHLY':
        bymonthday = params.get('BYMONTHDAY')
        if bymonthday:
            pattern['type'] = 'absoluteMonthly'
            pattern['dayOfMonth'] = int(bymonthday)
        else:
            pattern['type'] = 'absoluteMonthly'
            pattern['dayOfMonth'] = 1
    elif freq == 'YEARLY':
        pattern['type'] = 'absoluteYearly'
        pattern['month'] = 1
        pattern['dayOfMonth'] = 1
    else:
        return None

    # Build recurrence range
    start_date = (start.get('dateTime') or start.get('date', ''))[:10]
    recurrence_range = {'type': 'noEnd', 'startDate': start_date}

    # Handle UNTIL and COUNT
    if 'UNTIL' in params:
        until = params['UNTIL']
        # UNTIL can be YYYYMMDD or YYYYMMDDTHHMMSSZ
        if len(until) >= 8:
            recurrence_range['type'] = 'endDate'
            recurrence_range['endDate'] = f'{until[:4]}-{until[4:6]}-{until[6:8]}'
    elif 'COUNT' in params:
        recurrence_range['type'] = 'numbered'
        recurrence_range['numberOfOccurrences'] = int(params['COUNT'])

    return {'pattern': pattern, 'range': recurrence_range}
