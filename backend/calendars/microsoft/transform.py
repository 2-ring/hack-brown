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

    # Convert attendees
    attendees = ms_event.get('attendees', [])
    if attendees:
        universal_event['attendees'] = []
        for attendee in attendees:
            email_address = attendee.get('emailAddress', {})
            universal_event['attendees'].append({
                'email': email_address.get('address'),
                'displayName': email_address.get('name'),
                'responseStatus': _convert_response_status(attendee.get('status', {}).get('response'))
            })

    # Recurrence (simplified)
    if ms_event.get('recurrence'):
        universal_event['recurrence'] = ['RRULE:' + str(ms_event.get('recurrence'))]

    # Other fields
    if ms_event.get('isAllDay'):
        # Convert to all-day event format
        universal_event['start'] = {'date': start.get('dateTime', '').split('T')[0]}
        universal_event['end'] = {'date': end.get('dateTime', '').split('T')[0]}

    # Convert categories to semantic colors
    categories = ms_event.get('categories', [])
    if categories:
        # Preserve original categories for round-trip conversion
        universal_event['_microsoft_categories'] = categories
        # Map first category to Google colorId for universal format
        universal_event['colorId'] = _map_category_to_color(categories[0])

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

    # Convert attendees
    attendees = universal_event.get('attendees', [])
    if attendees:
        ms_event['attendees'] = []
        for attendee in attendees:
            ms_attendee = {
                'emailAddress': {
                    'address': attendee.get('email'),
                    'name': attendee.get('displayName', attendee.get('email'))
                },
                'type': 'required'
            }
            ms_event['attendees'].append(ms_attendee)

    # Convert colorId back to categories
    if universal_event.get('_microsoft_categories'):
        # Preserve original categories if they exist (round-trip)
        ms_event['categories'] = universal_event['_microsoft_categories']
    elif universal_event.get('colorId'):
        # Map colorId to a category name
        category = _map_color_to_category(universal_event['colorId'])
        ms_event['categories'] = [category]

    return ms_event


def _convert_response_status(ms_response: Optional[str]) -> str:
    """
    Convert Microsoft response status to Google Calendar format.

    Args:
        ms_response: Microsoft response status (accepted, declined, tentative, etc.)

    Returns:
        Google Calendar response status (accepted, declined, tentativelyAccepted, needsAction)
    """
    if not ms_response:
        return 'needsAction'

    status_map = {
        'accepted': 'accepted',
        'declined': 'declined',
        'tentativelyAccepted': 'tentativelyAccepted',
        'tentative': 'tentativelyAccepted',
        'notResponded': 'needsAction',
        'none': 'needsAction'
    }

    return status_map.get(ms_response.lower(), 'needsAction')


def _map_category_to_color(category: str) -> str:
    """
    Map Microsoft Outlook category to Google Calendar colorId.

    This provides semantic color mapping between Outlook categories and Google colors.
    Users can customize this mapping in their preferences.

    Args:
        category: Microsoft category name (e.g., "School", "Important")

    Returns:
        Google Calendar colorId (string number '1'-'11')
    """
    category_lower = category.lower()

    # Semantic category to color mapping
    # These map common Outlook categories to appropriate Google Calendar colors
    category_map = {
        # Academic/School (Sage/Turquoise)
        'school': '2',
        'academic': '2',
        'class': '2',
        'homework': '2',
        'study': '2',

        # Important/Urgent (Red)
        'important': '11',
        'urgent': '11',
        'deadline': '11',
        'critical': '11',

        # Personal (Blue)
        'personal': '9',
        'private': '9',

        # Work/Business (Green)
        'work': '10',
        'business': '10',
        'project': '10',

        # Meetings (Yellow)
        'meeting': '5',
        'appointment': '5',

        # Social/Events (Purple)
        'social': '3',
        'event': '3',
        'party': '3',

        # Travel (Orange)
        'travel': '6',
        'trip': '6',

        # Other common categories
        'birthday': '4',  # Flamingo/Pink
        'holiday': '4',
        'family': '7',    # Cyan
    }

    return category_map.get(category_lower, '1')  # Default to Lavender


def _map_color_to_category(color_id: str) -> str:
    """
    Map Google Calendar colorId to Microsoft Outlook category name.

    Args:
        color_id: Google Calendar colorId ('1'-'11')

    Returns:
        Microsoft Outlook category name
    """
    # Map Google colors to sensible category names
    color_map = {
        '1': 'General',      # Lavender
        '2': 'Academic',     # Sage/Turquoise
        '3': 'Social',       # Purple/Grape
        '4': 'Personal',     # Flamingo/Pink
        '5': 'Meeting',      # Yellow/Banana
        '6': 'Travel',       # Orange/Tangerine
        '7': 'Family',       # Cyan/Peacock
        '8': 'Other',        # Gray/Graphite
        '9': 'Personal',     # Blue/Blueberry
        '10': 'Work',        # Green/Basil
        '11': 'Important'    # Red/Tomato
    }

    return color_map.get(color_id, 'General')
