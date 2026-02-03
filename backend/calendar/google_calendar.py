"""
Google Calendar API integration with Supabase-stored tokens.
Creates calendar events from session processed_events.
"""

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from typing import Dict, Optional, List, Tuple
from datetime import datetime
import os

from database.models import User, Session as DBSession
from utils.encryption import decrypt_token


class GoogleCalendarClient:
    """Client for Google Calendar API using database-stored tokens."""

    SCOPES = ['https://www.googleapis.com/auth/calendar']

    def __init__(self, user_id: str):
        """
        Initialize calendar client for a specific user.

        Args:
            user_id: User's UUID from Supabase auth
        """
        self.user_id = user_id
        self.credentials = None
        self._load_credentials()

    def _load_credentials(self) -> None:
        """Load Google credentials from database."""
        user = User.get_by_id(self.user_id)

        if not user:
            raise ValueError(f"User {self.user_id} not found")

        # Get encrypted tokens from database
        encrypted_access_token = user.get('google_access_token')
        encrypted_refresh_token = user.get('google_refresh_token')
        token_expires_at = user.get('token_expires_at')

        if not encrypted_access_token:
            # User hasn't connected Google Calendar yet
            self.credentials = None
            return

        # Decrypt tokens
        access_token = decrypt_token(encrypted_access_token)
        refresh_token = decrypt_token(encrypted_refresh_token) if encrypted_refresh_token else None

        if not access_token:
            # Decryption failed
            raise ValueError(f"Failed to decrypt Google Calendar tokens for user {self.user_id}")

        # Create credentials object
        client_id = os.getenv('GOOGLE_CLIENT_ID')
        client_secret = os.getenv('GOOGLE_CLIENT_SECRET')

        self.credentials = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri='https://oauth2.googleapis.com/token',
            client_id=client_id,
            client_secret=client_secret,
            scopes=self.SCOPES
        )

        # Set expiry if available
        if token_expires_at:
            # Parse ISO datetime
            if isinstance(token_expires_at, str):
                self.credentials.expiry = datetime.fromisoformat(token_expires_at.replace('Z', '+00:00'))

    def is_authenticated(self) -> bool:
        """Check if user has valid Google Calendar credentials."""
        return self.credentials is not None and self.credentials.valid

    def _refresh_if_needed(self) -> bool:
        """
        Refresh credentials if expired.

        Returns:
            True if credentials are valid (either already valid or refreshed successfully)
        """
        if not self.credentials:
            return False

        if self.credentials.valid:
            return True

        # Try to refresh
        if self.credentials.expired and self.credentials.refresh_token:
            try:
                from google.auth.transport.requests import Request
                self.credentials.refresh(Request())

                # Save refreshed token to database
                User.update_google_tokens(
                    user_id=self.user_id,
                    access_token=self.credentials.token,
                    refresh_token=self.credentials.refresh_token,
                    expires_at=self.credentials.expiry
                )

                return True
            except Exception as e:
                print(f"Error refreshing credentials: {e}")
                return False

        return False

    def create_event(self, event_data: Dict, calendar_id: str = 'primary') -> Optional[Dict]:
        """
        Create a single event in Google Calendar.

        Args:
            event_data: Event data in Google Calendar API format
            calendar_id: Target calendar ID (default: 'primary')

        Returns:
            Created event data with 'id', 'htmlLink', etc., or None if failed
        """
        if not self._refresh_if_needed():
            raise Exception("Not authenticated with Google Calendar")

        try:
            service = build('calendar', 'v3', credentials=self.credentials)

            event = service.events().insert(
                calendarId=calendar_id,
                body=event_data
            ).execute()

            return event

        except HttpError as error:
            print(f"Error creating event: {error}")
            return None

    def check_conflicts(self, start_time: str, end_time: str, calendar_id: str = 'primary') -> List[Dict]:
        """
        Check for scheduling conflicts using Freebusy API.

        Args:
            start_time: ISO format datetime
            end_time: ISO format datetime
            calendar_id: Calendar to check (default: 'primary')

        Returns:
            List of busy time periods that conflict
        """
        if not self._refresh_if_needed():
            raise Exception("Not authenticated with Google Calendar")

        try:
            service = build('calendar', 'v3', credentials=self.credentials)

            body = {
                "timeMin": start_time,
                "timeMax": end_time,
                "items": [{"id": calendar_id}]
            }

            result = service.freebusy().query(body=body).execute()
            busy_periods = result.get('calendars', {}).get(calendar_id, {}).get('busy', [])

            return busy_periods

        except HttpError as error:
            print(f"Error checking conflicts: {error}")
            return []

    def create_events_from_session(self, session_id: str) -> Tuple[List[str], List[Dict]]:
        """
        Create calendar events from a session's processed_events.

        Args:
            session_id: Session UUID

        Returns:
            Tuple of (calendar_event_ids, conflicts)
            - calendar_event_ids: List of created event IDs
            - conflicts: List of detected conflicts with details
        """
        # Get session
        session = DBSession.get_by_id(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Verify session belongs to user
        if session.get('user_id') != self.user_id:
            raise PermissionError("Session does not belong to user")

        # Get processed events
        processed_events = session.get('processed_events', [])
        if not processed_events:
            raise ValueError("No processed events in session")

        calendar_event_ids = []
        all_conflicts = []

        for event in processed_events:
            # Check for conflicts first
            start_time = event.get('start', {}).get('dateTime')
            end_time = event.get('end', {}).get('dateTime')

            if start_time and end_time:
                conflicts = self.check_conflicts(start_time, end_time)

                if conflicts:
                    all_conflicts.append({
                        'event_summary': event.get('summary'),
                        'proposed_start': start_time,
                        'proposed_end': end_time,
                        'conflicts': conflicts
                    })

            # Create event regardless of conflicts (user can decide what to do)
            created_event = self.create_event(event)

            if created_event:
                calendar_event_ids.append(created_event['id'])
            else:
                # Failed to create event
                raise Exception(f"Failed to create event: {event.get('summary')}")

        # Update session with calendar event IDs
        DBSession.mark_added_to_calendar(session_id, calendar_event_ids)

        # Also store conflicts in session
        if all_conflicts:
            DBSession.update_events(session_id, conflicts=all_conflicts)

        return calendar_event_ids, all_conflicts


def store_google_tokens_from_supabase(user_id: str, provider_token: Dict) -> None:
    """
    Store Google OAuth tokens from Supabase Auth session.

    This should be called after the user first signs in with Google OAuth.

    Args:
        user_id: User's Supabase user ID
        provider_token: Provider token dict from Supabase session containing:
            - access_token: Google access token
            - refresh_token: Google refresh token (optional)
            - expires_at: Token expiration timestamp (optional)
    """
    access_token = provider_token.get('access_token')
    refresh_token = provider_token.get('refresh_token')
    expires_at = provider_token.get('expires_at')

    if not access_token:
        raise ValueError("No access_token in provider_token")

    # Convert expires_at timestamp to datetime if present
    expiry_datetime = None
    if expires_at:
        if isinstance(expires_at, (int, float)):
            expiry_datetime = datetime.fromtimestamp(expires_at)
        elif isinstance(expires_at, str):
            expiry_datetime = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))

    User.update_google_tokens(
        user_id=user_id,
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=expiry_datetime
    )
