"""
Microsoft Calendar authentication and credential management.
Handles OAuth token loading, refresh, and validation for Microsoft Graph API.
"""

from typing import Optional, Dict, Any
from datetime import datetime
import os
import threading
import requests

from database.models import User


def load_credentials(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Load Microsoft OAuth credentials from database.

    Args:
        user_id: User's UUID from Supabase auth

    Returns:
        Dict with access_token, refresh_token, expires_at or None if not connected

    Raises:
        ValueError: If user not found
    """
    user = User.get_by_id(user_id)

    if not user:
        raise ValueError(f"User {user_id} not found")

    # Get decrypted tokens from provider_connections
    tokens = User.get_provider_tokens(user_id, 'microsoft')

    if not tokens:
        # User hasn't connected Microsoft Calendar yet
        return None

    access_token = tokens.get('access_token')
    if not access_token:
        # No valid access token
        raise ValueError(f"No valid Microsoft Calendar access token for user {user_id}")

    return tokens


def is_authenticated(user_id: str) -> bool:
    """
    Check if user has valid Microsoft Calendar credentials.

    Args:
        user_id: User's UUID

    Returns:
        True if user has valid credentials
    """
    try:
        credentials = load_credentials(user_id)
        if not credentials:
            return False

        # Check if token is expired
        expires_at = credentials.get('expires_at')
        if expires_at:
            if isinstance(expires_at, str):
                expiry = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
            else:
                expiry = expires_at

            # If expired, try to refresh
            if datetime.now(expiry.tzinfo) >= expiry:
                return refresh_if_needed(user_id, credentials)

        return True
    except Exception:
        return False


def refresh_if_needed(user_id: str, credentials: Dict[str, Any]) -> bool:
    """
    Refresh Microsoft credentials if expired.

    Args:
        user_id: User's UUID
        credentials: Credentials dict with access_token, refresh_token, expires_at

    Returns:
        True if credentials are valid (either already valid or refreshed successfully)
    """
    if not credentials:
        return False

    expires_at = credentials.get('expires_at')
    if not expires_at:
        return True  # No expiry info, assume valid

    # Parse expiry
    if isinstance(expires_at, str):
        expiry = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
    else:
        expiry = expires_at

    # Check if expired
    if datetime.now(expiry.tzinfo) < expiry:
        return True  # Not expired yet

    # Try to refresh
    refresh_token = credentials.get('refresh_token')
    if not refresh_token:
        return False  # Can't refresh without refresh token

    try:
        # Microsoft token endpoint
        tenant_id = os.getenv('MICROSOFT_TENANT_ID', 'common')
        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"

        # Refresh token request
        data = {
            'client_id': os.getenv('MICROSOFT_CLIENT_ID'),
            'client_secret': os.getenv('MICROSOFT_CLIENT_SECRET'),
            'refresh_token': refresh_token,
            'grant_type': 'refresh_token',
            'scope': 'https://graph.microsoft.com/Calendars.ReadWrite offline_access'
        }

        response = requests.post(token_url, data=data)
        response.raise_for_status()
        token_data = response.json()

        # Calculate new expiry
        expires_in = token_data.get('expires_in', 3600)
        new_expiry = datetime.now()
        from datetime import timedelta
        new_expiry = new_expiry + timedelta(seconds=expires_in)

        # Save refreshed token to database
        User.update_provider_tokens(
            user_id=user_id,
            provider='microsoft',
            tokens={
                'access_token': token_data['access_token'],
                'refresh_token': token_data.get('refresh_token', refresh_token),  # Some providers don't return new refresh token
                'expires_at': new_expiry.isoformat()
            }
        )

        return True
    except Exception as e:
        print(f"Error refreshing Microsoft credentials: {e}")
        return False


def store_microsoft_tokens(user_id: str, token_data: dict) -> None:
    """
    Store Microsoft OAuth tokens from OAuth flow.

    This should be called when the user connects their Microsoft Calendar.
    Ensures the provider connection exists and has 'calendar' in usage array.

    Args:
        user_id: User's Supabase user ID
        token_data: Token dict from Microsoft OAuth containing:
            - access_token: Microsoft access token
            - refresh_token: Microsoft refresh token (optional)
            - expires_in: Token expiration seconds (optional)
            - email: User's Microsoft email (optional)

    Raises:
        ValueError: If no access_token in token_data
    """
    access_token = token_data.get('access_token')
    refresh_token = token_data.get('refresh_token')
    expires_in = token_data.get('expires_in')
    email = token_data.get('email')

    if not access_token:
        raise ValueError("No access_token in token_data")

    # Get user to check provider connections
    user = User.get_by_id(user_id)
    if not user:
        raise ValueError(f"User {user_id} not found")

    # Check if Microsoft provider connection exists
    microsoft_conn = User.get_provider_connection(user_id, 'microsoft')

    if not microsoft_conn:
        # No Microsoft connection yet - create one
        User.add_provider_connection(
            user_id=user_id,
            provider='microsoft',
            provider_id=None,  # Will be populated from OAuth
            email=email or user.get('email'),
            usage=['calendar']
        )
    else:
        # Update usage to include 'calendar' if not already present
        usage = microsoft_conn.get('usage', [])
        if 'calendar' not in usage:
            usage.append('calendar')
            User.update_provider_usage(user_id, 'microsoft', usage)

    # Calculate expiry
    expires_at_iso = None
    if expires_in:
        from datetime import timedelta
        expiry = datetime.now() + timedelta(seconds=expires_in)
        expires_at_iso = expiry.isoformat()

    # Store the encrypted tokens
    User.update_provider_tokens(
        user_id=user_id,
        provider='microsoft',
        tokens={
            'access_token': access_token,
            'refresh_token': refresh_token,
            'expires_at': expires_at_iso
        }
    )

    # Set as primary calendar provider if none is set
    if not user.get('primary_calendar_provider'):
        User.set_primary_calendar(user_id, 'microsoft')

    # Fetch and store timezone from Microsoft mailbox settings (non-blocking)
    def _fetch_timezone():
        try:
            from . import fetch
            tz = fetch.get_mailbox_timezone(user_id)
            if tz:
                from pipeline.personalization.service import PersonalizationService
                PersonalizationService.save_timezone(user_id, tz)
        except Exception as e:
            print(f"Warning: Could not fetch/store timezone for user {user_id}: {e}")

    threading.Thread(target=_fetch_timezone, daemon=True).start()
