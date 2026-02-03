"""
Google Calendar API integration service.
Handles OAuth 2.0 authentication and calendar operations.
"""

import os
import json
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from typing import Dict, Optional, List
from datetime import datetime


class CalendarService:
    """Service class for Google Calendar API operations"""

    # OAuth 2.0 scopes - request access to read and write calendar events
    SCOPES = ['https://www.googleapis.com/auth/calendar']

    # OAuth redirect URI - must match what's configured in Google Cloud Console
    REDIRECT_URI = 'http://localhost:5000/api/oauth/callback'

    def __init__(self, credentials_file: str = 'credentials.json', token_file: str = 'token.json'):
        """
        Initialize the Calendar Service.

        Args:
            credentials_file: Path to OAuth 2.0 client credentials from Google Cloud Console
            token_file: Path to store user access tokens
        """
        self.credentials_file = credentials_file
        self.token_file = token_file
        self.credentials = None

        # Load existing credentials if available
        self._load_credentials()

    def _load_credentials(self) -> None:
        """Load credentials from token file if it exists"""
        if os.path.exists(self.token_file):
            try:
                with open(self.token_file, 'r') as token:
                    creds_data = json.load(token)
                    self.credentials = Credentials.from_authorized_user_info(creds_data, self.SCOPES)
            except Exception as e:
                print(f"Error loading credentials: {e}")
                self.credentials = None

    def _save_credentials(self) -> None:
        """Save credentials to token file"""
        if self.credentials:
            try:
                with open(self.token_file, 'w') as token:
                    token.write(self.credentials.to_json())
            except Exception as e:
                print(f"Error saving credentials: {e}")

    def get_authorization_url(self) -> str:
        """
        Generate OAuth 2.0 authorization URL for user to grant access.
        Supports both environment variables and credentials file.

        Returns:
            Authorization URL to redirect user to
        """
        # Check for environment variables first
        client_id = os.getenv('GOOGLE_CLIENT_ID')
        client_secret = os.getenv('GOOGLE_CLIENT_SECRET')

        if client_id and client_secret:
            # Create flow from environment variables
            client_config = {
                "web": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [self.REDIRECT_URI]
                }
            }
            flow = Flow.from_client_config(
                client_config,
                scopes=self.SCOPES,
                redirect_uri=self.REDIRECT_URI
            )
        elif os.path.exists(self.credentials_file):
            # Fall back to credentials file
            flow = Flow.from_client_secrets_file(
                self.credentials_file,
                scopes=self.SCOPES,
                redirect_uri=self.REDIRECT_URI
            )
        else:
            raise FileNotFoundError(
                "No OAuth credentials found. Either:\n"
                "1. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables, or\n"
                f"2. Place credentials.json file at '{self.credentials_file}'\n"
                "Please follow GOOGLE_CALENDAR_SETUP.md for setup instructions."
            )

        authorization_url, _ = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent'
        )

        return authorization_url

    def handle_oauth_callback(self, authorization_response: str) -> bool:
        """
        Handle OAuth callback and exchange authorization code for access token.
        Supports both environment variables and credentials file.

        Args:
            authorization_response: Full callback URL with authorization code

        Returns:
            True if authentication successful, False otherwise
        """
        try:
            # Check for environment variables first
            client_id = os.getenv('GOOGLE_CLIENT_ID')
            client_secret = os.getenv('GOOGLE_CLIENT_SECRET')

            if client_id and client_secret:
                # Create flow from environment variables
                client_config = {
                    "web": {
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                        "token_uri": "https://oauth2.googleapis.com/token",
                        "redirect_uris": [self.REDIRECT_URI]
                    }
                }
                flow = Flow.from_client_config(
                    client_config,
                    scopes=self.SCOPES,
                    redirect_uri=self.REDIRECT_URI
                )
            else:
                # Fall back to credentials file
                flow = Flow.from_client_secrets_file(
                    self.credentials_file,
                    scopes=self.SCOPES,
                    redirect_uri=self.REDIRECT_URI
                )

            flow.fetch_token(authorization_response=authorization_response)
            self.credentials = flow.credentials
            self._save_credentials()

            return True
        except Exception as e:
            print(f"Error handling OAuth callback: {e}")
            return False

    def is_authenticated(self) -> bool:
        """Check if user is authenticated and credentials are valid"""
        return self.credentials is not None and self.credentials.valid

    def refresh_credentials(self) -> bool:
        """
        Refresh expired credentials if refresh token is available.

        Returns:
            True if refresh successful, False otherwise
        """
        if self.credentials and self.credentials.expired and self.credentials.refresh_token:
            try:
                self.credentials.refresh()
                self._save_credentials()
                return True
            except Exception as e:
                print(f"Error refreshing credentials: {e}")
                return False
        return False

    def create_event(self, event_data: Dict, calendar_id: Optional[str] = None) -> Optional[Dict]:
        """
        Create a new event in the user's Google Calendar.

        Args:
            event_data: Event data in Google Calendar API format:
                {
                    'summary': 'Event title',
                    'start': {'dateTime': '2026-02-01T14:00:00-05:00', 'timeZone': 'America/New_York'},
                    'end': {'dateTime': '2026-02-01T15:00:00-05:00', 'timeZone': 'America/New_York'},
                    'location': 'Conference Room',
                    'description': 'Event description',
                    'recurrence': ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
                    'attendees': [{'email': 'person@example.com'}]
                }
            calendar_id: Optional calendar ID. If None, uses 'primary'.
                        Can be 'primary' or actual calendar ID from get_calendar_list()

        Returns:
            Created event data from Google Calendar API, or None if failed
        """
        if not self.is_authenticated():
            # Try to refresh credentials if expired
            if not self.refresh_credentials():
                raise Exception("Not authenticated. Please authorize first.")

        # Default to primary if not specified
        if calendar_id is None:
            calendar_id = 'primary'

        try:
            # Build Calendar API service
            service = build('calendar', 'v3', credentials=self.credentials)

            # Create event on specified calendar
            event = service.events().insert(
                calendarId=calendar_id,
                body=event_data
            ).execute()

            return event

        except HttpError as error:
            print(f"An error occurred creating event on calendar {calendar_id}: {error}")
            return None

    def list_events(self, max_results: int = 10, time_min: Optional[str] = None, page_token: Optional[str] = None, return_full_response: bool = False, calendar_id: str = 'primary') -> Dict:
        """
        List upcoming events from user's calendar.

        Args:
            max_results: Maximum number of events to return
            time_min: Lower bound for event start time (ISO format)
            page_token: Token for pagination (from previous response's nextPageToken)
            return_full_response: If True, returns full API response with pagination info.
                                 If False, returns just the items list for backwards compatibility.
            calendar_id: ID of the calendar to fetch events from (default: 'primary')

        Returns:
            If return_full_response=True: Full API response dict with 'items' and 'nextPageToken'
            If return_full_response=False: List of event dictionaries (backwards compatible)
        """
        if not self.is_authenticated():
            if not self.refresh_credentials():
                raise Exception("Not authenticated. Please authorize first.")

        try:
            service = build('calendar', 'v3', credentials=self.credentials)

            # If no time_min specified, use current time
            if not time_min:
                time_min = datetime.utcnow().isoformat() + 'Z'

            events_result = service.events().list(
                calendarId=calendar_id,
                timeMin=time_min,
                maxResults=max_results,
                singleEvents=True,
                orderBy='startTime',
                pageToken=page_token
            ).execute()

            # Return full response or just items based on flag
            if return_full_response:
                return events_result
            else:
                return events_result.get('items', [])

        except HttpError as error:
            print(f"An error occurred: {error}")
            return {} if return_full_response else []

    def check_conflicts(self, start_time: str, end_time: str) -> List[Dict]:
        """
        Check for scheduling conflicts using the Freebusy API.

        Args:
            start_time: Start time in ISO format (e.g., '2026-02-01T14:00:00-05:00')
            end_time: End time in ISO format

        Returns:
            List of busy time periods that conflict with the proposed time
        """
        if not self.is_authenticated():
            if not self.refresh_credentials():
                raise Exception("Not authenticated. Please authorize first.")

        try:
            service = build('calendar', 'v3', credentials=self.credentials)

            body = {
                "timeMin": start_time,
                "timeMax": end_time,
                "items": [{"id": "primary"}]
            }

            freebusy_result = service.freebusy().query(body=body).execute()

            # Extract busy periods for primary calendar
            busy_periods = freebusy_result.get('calendars', {}).get('primary', {}).get('busy', [])

            return busy_periods

        except HttpError as error:
            print(f"An error occurred: {error}")
            return []

    def get_settings(self) -> Dict:
        """
        Get user's calendar settings and preferences.

        Returns:
            Dictionary with user settings including:
            - timezone: User's default timezone
            - dateFieldOrder: Date format preference
            - timeFormat: 12hr vs 24hr preference
            - weekStart: Which day starts the week
            - defaultEventLength: Default event duration in minutes
        """
        if not self.is_authenticated():
            if not self.refresh_credentials():
                raise Exception("Not authenticated. Please authorize first.")

        try:
            service = build('calendar', 'v3', credentials=self.credentials)

            settings_result = service.settings().list().execute()

            # Convert list of settings to dictionary for easier access
            settings_dict = {}
            for setting in settings_result.get('items', []):
                settings_dict[setting['id']] = setting['value']

            return settings_dict

        except HttpError as error:
            print(f"An error occurred: {error}")
            return {}

    def get_colors(self) -> Dict:
        """
        Get color palette definitions.

        Returns:
            Dictionary with color definitions:
            - event: Dict mapping colorId to color info (background, foreground)
            - calendar: Dict mapping colorId to color info
        """
        if not self.is_authenticated():
            if not self.refresh_credentials():
                raise Exception("Not authenticated. Please authorize first.")

        try:
            service = build('calendar', 'v3', credentials=self.credentials)

            colors_result = service.colors().get().execute()

            return colors_result

        except HttpError as error:
            print(f"An error occurred: {error}")
            return {}

    def get_calendar_list(self) -> List[Dict]:
        """
        Get list of all calendars the user has access to.

        Returns:
            List of calendar dictionaries with info like:
            - id: Calendar ID
            - summary: Calendar name
            - description: Calendar description
            - backgroundColor: Calendar color
            - primary: Whether this is the primary calendar
        """
        if not self.is_authenticated():
            if not self.refresh_credentials():
                raise Exception("Not authenticated. Please authorize first.")

        try:
            service = build('calendar', 'v3', credentials=self.credentials)

            calendar_list_result = service.calendarList().list().execute()

            return calendar_list_result.get('items', [])

        except HttpError as error:
            print(f"An error occurred: {error}")
            return []
