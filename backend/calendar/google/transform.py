"""
Google Calendar format transformations.

Since Google Calendar format IS the universal format used throughout DropCal,
this module is mostly pass-through. Included for consistency with other providers.
"""

from typing import Dict


def to_universal(google_event: Dict) -> Dict:
    """
    Transform Google Calendar event to universal format.

    Since Google Calendar format is the universal format, this is a pass-through.

    Args:
        google_event: Event in Google Calendar format

    Returns:
        Event in universal format (unchanged)
    """
    return google_event


def from_universal(universal_event: Dict) -> Dict:
    """
    Transform universal format event to Google Calendar format.

    Since Google Calendar format is the universal format, this is a pass-through.

    Args:
        universal_event: Event in universal format

    Returns:
        Event in Google Calendar format (unchanged)
    """
    return universal_event
