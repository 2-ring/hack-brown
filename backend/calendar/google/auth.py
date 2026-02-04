"""
Google Calendar authentication and credential management.
Handles OAuth token loading, refresh, and validation.
"""

from google.oauth2.credentials import Credentials
from typing import Optional
from datetime import datetime
import os

from database.models import User
from utils.encryption import decrypt_token


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

    # Get encrypted tokens from database
    encrypted_access_token = user.get('google_access_token')
    encrypted_refresh_token = user.get('google_refresh_token')
    token_expires_at = user.get('token_expires_at')

    if not encrypted_access_token:
        # User hasn't connected Google Calendar yet
        return None

    # Decrypt tokens
    access_token = decrypt_token(encrypted_access_token)
    refresh_token = decrypt_token(encrypted_refresh_token) if encrypted_refresh_token else None

    if not access_token:
        # Decryption failed
        raise ValueError(f"Failed to decrypt Google Calendar tokens for user {user_id}")

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

    Args:
        user_id: User's UUID

    Returns:
        True if user has valid credentials
    """
    try:
        credentials = load_credentials(user_id)
        return credentials is not None and credentials.valid
    except Exception:
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

    # Try to refresh
    if credentials.expired and credentials.refresh_token:
        try:
            from google.auth.transport.requests import Request
            credentials.refresh(Request())

            # Save refreshed token to database
            User.update_google_tokens(
                user_id=user_id,
                access_token=credentials.token,
                refresh_token=credentials.refresh_token,
                expires_at=credentials.expiry
            )

            return True
        except Exception as e:
            print(f"Error refreshing Google credentials: {e}")
            return False

    return False


def store_google_tokens_from_supabase(user_id: str, provider_token: dict) -> None:
    """
    Store Google OAuth tokens from Supabase Auth session.

    This should be called after the user first signs in with Google OAuth.

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
