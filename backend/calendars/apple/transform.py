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

    # Convert attendees
    attendees = ical_event.get('ATTENDEE')
    if attendees:
        universal_event['attendees'] = []
        # Attendees can be a single value or a list
        if not isinstance(attendees, list):
            attendees = [attendees]

        for attendee in attendees:
            attendee_str = str(attendee)
            # Extract email from mailto: URI
            email = attendee_str.replace('mailto:', '').strip()

            # Get attendee name if available (from CN parameter)
            name = attendee.params.get('CN', email) if hasattr(attendee, 'params') else email

            universal_event['attendees'].append({
                'email': email,
                'displayName': name,
                'responseStatus': 'needsAction'  # iCal doesn't always include response status
            })

    # Recurrence rules
    if ical_event.get('RRULE'):
        rrule = ical_event.get('RRULE')
        # Convert RRULE to RRULE string format
        universal_event['recurrence'] = [f'RRULE:{rrule.to_ical().decode()}']

    # Convert iCalendar COLOR property (RFC 7986) to Google colorId
    if ical_event.get('COLOR'):
        color_value = str(ical_event.get('COLOR'))
        # Preserve original Apple color for round-trip conversion
        universal_event['_apple_color'] = color_value
        universal_event['colorId'] = _map_ical_color_to_google(color_value)

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

    # Convert attendees
    attendees = universal_event.get('attendees', [])
    for attendee in attendees:
        email = attendee.get('email')
        if email:
            from icalendar import vCalAddress
            attendee_addr = vCalAddress(f'mailto:{email}')
            if attendee.get('displayName'):
                attendee_addr.params['CN'] = attendee['displayName']
            attendee_addr.params['ROLE'] = 'REQ-PARTICIPANT'
            event.add('attendee', attendee_addr)

    # Convert colorId to iCalendar COLOR property (RFC 7986)
    if universal_event.get('_apple_color'):
        # Preserve original Apple color if it exists (round-trip)
        event.add('color', universal_event['_apple_color'])
    elif universal_event.get('colorId'):
        # Map Google colorId to iCalendar COLOR (CSS3 color name)
        ical_color = _map_google_to_ical_color(universal_event['colorId'])
        event.add('color', ical_color)

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


def _map_ical_color_to_google(ical_color: str) -> str:
    """
    Map iCalendar COLOR property (RFC 7986) to Google Calendar colorId.

    Supports both CSS3 color names and hex color values.
    Apple Calendar uses both formats depending on the platform.

    Args:
        ical_color: COLOR property value (CSS3 name or hex like '#FF0000')

    Returns:
        Google Calendar colorId (string number '1'-'11')
    """
    # Normalize the color value
    color_lower = ical_color.lower().strip()

    # CSS3 color names to Google colorId
    # Based on semantic mapping of common calendar colors
    css_color_map = {
        # Blues
        'blue': '9',
        'darkblue': '9',
        'lightblue': '9',
        'navy': '9',

        # Greens
        'green': '10',
        'darkgreen': '10',
        'lightgreen': '10',
        'lime': '10',

        # Reds
        'red': '11',
        'darkred': '11',
        'crimson': '11',
        'tomato': '11',

        # Purples
        'purple': '3',
        'violet': '3',
        'magenta': '3',
        'orchid': '3',

        # Yellows
        'yellow': '5',
        'gold': '5',
        'orange': '6',
        'darkorange': '6',

        # Cyans/Turquoise
        'cyan': '7',
        'turquoise': '2',
        'teal': '2',
        'aqua': '7',

        # Pinks
        'pink': '4',
        'hotpink': '4',
        'deeppink': '4',

        # Grays
        'gray': '8',
        'grey': '8',
        'silver': '8',
        'darkgray': '8',
        'darkgrey': '8',

        # Lavender/Light purples
        'lavender': '1',
        'plum': '1',
    }

    # Check if it's a CSS color name
    if color_lower in css_color_map:
        return css_color_map[color_lower]

    # Check if it's a hex color (Apple CalDAV extension)
    if ical_color.startswith('#'):
        # Map common hex values to nearest Google colorId
        # These are based on Apple Calendar's default color palette
        hex_map = {
            '#63DA38': '10',  # Apple's green
            '#FF0000': '11',  # Red
            '#FF6B6B': '11',  # Light red
            '#0000FF': '9',   # Blue
            '#4A90E2': '9',   # Light blue
            '#00FF00': '10',  # Green
            '#FFFF00': '5',   # Yellow
            '#FFD700': '5',   # Gold
            '#FFA500': '6',   # Orange
            '#FF8C00': '6',   # Dark orange
            '#800080': '3',   # Purple
            '#9B59B6': '3',   # Light purple
            '#FF69B4': '4',   # Hot pink
            '#FFC0CB': '4',   # Pink
            '#00FFFF': '7',   # Cyan
            '#40E0D0': '2',   # Turquoise
            '#808080': '8',   # Gray
            '#E6E6FA': '1',   # Lavender
        }

        # Normalize hex to uppercase
        hex_upper = ical_color.upper()
        if hex_upper in hex_map:
            return hex_map[hex_upper]

        # If not in our map, try to guess based on RGB values
        # This is a simplified heuristic
        try:
            # Remove # and parse hex
            hex_value = ical_color[1:]
            r = int(hex_value[0:2], 16)
            g = int(hex_value[2:4], 16)
            b = int(hex_value[4:6], 16)

            # Simple color detection based on which channel is strongest
            if r > g and r > b:
                return '11' if r > 200 else '6'  # Red or Orange
            elif g > r and g > b:
                return '10'  # Green
            elif b > r and b > g:
                return '9'   # Blue
            elif r > 150 and g > 150 and b < 100:
                return '5'   # Yellow
            elif r > 100 and g < 100 and b > 100:
                return '3'   # Purple
            elif r > 200 and g > 150 and b > 150:
                return '4'   # Pink
            elif r < 100 and g > 150 and b > 150:
                return '7'   # Cyan
            elif abs(r - g) < 30 and abs(g - b) < 30:
                return '8'   # Gray
        except (ValueError, IndexError):
            pass

    # Default to Lavender if we can't determine
    return '1'


def _map_google_to_ical_color(color_id: str) -> str:
    """
    Map Google Calendar colorId to iCalendar COLOR property (CSS3 name).

    Uses CSS3 color names as specified in RFC 7986.

    Args:
        color_id: Google Calendar colorId ('1'-'11')

    Returns:
        CSS3 color name for iCalendar COLOR property
    """
    # Map Google colorIds to CSS3 color names
    # These are semantic mappings that work well across platforms
    color_map = {
        '1': 'lavender',      # Lavender
        '2': 'turquoise',     # Sage/Turquoise
        '3': 'purple',        # Grape/Purple
        '4': 'pink',          # Flamingo/Pink
        '5': 'yellow',        # Banana/Yellow
        '6': 'orange',        # Tangerine/Orange
        '7': 'cyan',          # Peacock/Cyan
        '8': 'gray',          # Graphite/Gray
        '9': 'blue',          # Blueberry/Blue
        '10': 'green',        # Basil/Green
        '11': 'red'           # Tomato/Red
    }

    return color_map.get(color_id, 'blue')  # Default to blue
