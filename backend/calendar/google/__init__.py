"""
Google Calendar integration module.

Provides authentication, event fetching, and event creation for Google Calendar.
All functions accept/return events in universal format (Google Calendar JSON).
"""

from calendar.google import auth, fetch, create, transform

# Re-export commonly used functions for convenience
__all__ = [
    'auth',
    'fetch',
    'create',
    'transform',
]
