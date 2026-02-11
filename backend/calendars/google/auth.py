"""
Google Calendar authentication and credential management.
Handles OAuth token loading, refresh, and validation.
"""

from google.oauth2.credentials import Credentials
from typing import Optional
from datetime import datetime
import os

from database.models import User


SCOPES = ['https://www.googleapis.com/auth/calendar']


def load_credentials(user_id: str) -> Optional[Credentials]:
    """
    Load Google OAuth credentials from database.

    Args:
        user_id: User's UUID from Supabase auth

    Returns:
        Credentials object or None if user hasn't connected Google Calendar

    Raises:
        ValueError: If user not found or token decryption fails
    """
    user = User.get_by_id(user_id)

    if not user:
        raise ValueError(f"User {user_id} not found")

    # Get decrypted tokens from provider_connections
    tokens = User.get_provider_tokens(user_id, 'google')

    if not tokens:
        # User hasn't connected Google Calendar yet
        return None

    access_token = tokens.get('access_token')
    refresh_token = tokens.get('refresh_token')
    token_expires_at = tokens.get('expires_at')

    if not access_token:
        # No valid access token
        raise ValueError(f"No valid Google Calendar access token for user {user_id}")

    # Create credentials object
    client_id = os.getenv('GOOGLE_CLIENT_ID')
    client_secret = os.getenv('GOOGLE_CLIENT_SECRET')

    credentials = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri='https://oauth2.googleapis.com/token',
        client_id=client_id,
        client_secret=client_secret,
        scopes=SCOPES
    )

    # Set expiry if available
    if token_expires_at:
        # Parse ISO datetime
        if isinstance(token_expires_at, str):
            credentials.expiry = datetime.fromisoformat(token_expires_at.replace('Z', '+00:00'))

    return credentials


def is_authenticated(user_id: str) -> bool:
    """
    Check if user has valid Google Calendar credentials.
    Attempts to refresh expired tokens before returning False.

    Args:
        user_id: User's UUID

    Returns:
        True if user has valid credentials
    """
    try:
        credentials = load_credentials(user_id)
        if credentials is None:
            return False
        if credentials.valid:
            return True
        # Token exists but is expired — try refreshing
        return refresh_if_needed(user_id, credentials)
    except Exception as e:
        print(f"Google Calendar auth check failed for user {user_id}: {e}")
        return False


def refresh_if_needed(user_id: str, credentials: Credentials) -> bool:
    """
    Refresh credentials if expired.

    Args:
        user_id: User's UUID
        credentials: Credentials object to refresh

    Returns:
        True if credentials are valid (either already valid or refreshed successfully)
    """
    if not credentials:
        return False

    if credentials.valid:
        return True

    # Guard against corrupted refresh token (historical bug stored str(None))
    if credentials.refresh_token == "None":
        print(f"Corrupted refresh_token (literal 'None') for user {user_id}. Re-auth required.")
        return False

    # Try to refresh
    if credentials.expired and credentials.refresh_token:
        try:
            from google.auth.transport.requests import Request
            credentials.refresh(Request())

            # Save refreshed token to database
            User.update_provider_tokens(
                user_id=user_id,
                provider='google',
                tokens={
                    'access_token': credentials.token,
                    'refresh_token': credentials.refresh_token,
                    'expires_at': credentials.expiry.isoformat() if credentials.expiry else None
                }
            )

            return True
        except Exception as e:
            print(f"Error refreshing Google credentials: {e}")
            return False

    return False


def store_google_tokens_from_supabase(user_id: str, provider_token: dict) -> None:
    """
    Store Google OAuth tokens from Supabase Auth session.

    This should be called when the user connects their Google Calendar.
    Ensures the provider connection exists and has 'calendar' in usage array.
    Also fetches and stores the user's timezone from Google Calendar settings.

    Args:
        user_id: User's Supabase user ID
        provider_token: Provider token dict from Supabase session containing:
            - access_token: Google access token
            - refresh_token: Google refresh token (optional)
            - expires_at: Token expiration timestamp (optional)

    Raises:
        ValueError: If no access_token in provider_token
    """
    access_token = provider_token.get('access_token')
    refresh_token = provider_token.get('refresh_token')
    expires_at = provider_token.get('expires_at')

    if not access_token:
        raise ValueError("No access_token in provider_token")

    if not refresh_token:
        print(f"Warning: No refresh_token provided for user {user_id}. Existing refresh token will be preserved.")

    # Get user to check provider connections
    user = User.get_by_id(user_id)
    if not user:
        raise ValueError(f"User {user_id} not found")

    # Check if Google provider connection exists
    google_conn = User.get_provider_connection(user_id, 'google')

    if not google_conn:
        # No Google connection yet - create one
        # This shouldn't normally happen since they sign in with Google first
        User.add_provider_connection(
            user_id=user_id,
            provider='google',
            provider_id=None,  # Will be populated from OAuth
            email=user.get('email'),
            usage=['calendar']
        )
    else:
        # Update usage to include 'calendar' if not already present
        usage = google_conn.get('usage', [])
        if 'calendar' not in usage:
            usage.append('calendar')
            User.update_provider_usage(user_id, 'google', usage)

    # Convert expires_at timestamp to ISO string if present
    expires_at_iso = None
    if expires_at:
        if isinstance(expires_at, (int, float)):
            expires_at_iso = datetime.fromtimestamp(expires_at).isoformat()
        elif isinstance(expires_at, str):
            expires_at_iso = expires_at

    # Store the encrypted tokens
    User.update_provider_tokens(
        user_id=user_id,
        provider='google',
        tokens={
            'access_token': access_token,
            'refresh_token': refresh_token,
            'expires_at': expires_at_iso
        }
    )

    # Set as primary calendar provider if none is set
    if not user.get('primary_calendar_provider'):
        User.set_primary_calendar(user_id, 'google')

    # Fetch and store timezone from Google Calendar settings
    try:
        from . import fetch
        settings = fetch.get_calendar_settings(user_id)
        if settings and settings.get('timezone'):
            from preferences.service import PersonalizationService
            PersonalizationService.save_timezone(user_id, settings['timezone'])
    except Exception as e:
        print(f"Warning: Could not fetch/store timezone for user {user_id}: {e}")
