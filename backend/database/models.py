"""
Database models for User and Session operations.
Provides CRUD operations for Supabase tables.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from .supabase_client import get_supabase
from utils.encryption import encrypt_token, decrypt_token


class User:
    """User model for database operations."""

    @staticmethod
    def create(
        email: str,
        google_id: Optional[str] = None,
        display_name: Optional[str] = None,
        photo_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new user.

        Args:
            email: User's email address (required)
            google_id: Google OAuth ID (optional)
            display_name: User's display name (optional)
            photo_url: URL to user's profile photo (optional)

        Returns:
            Dict containing the created user data
        """
        supabase = get_supabase()

        data = {
            "email": email,
            "google_id": google_id,
            "display_name": display_name,
            "photo_url": photo_url
        }

        response = supabase.table("users").insert(data).execute()
        return response.data[0]

    @staticmethod
    def get_by_id(user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get user by ID.

        Args:
            user_id: User's UUID

        Returns:
            Dict containing user data or None if not found
        """
        supabase = get_supabase()
        response = supabase.table("users").select("*").eq("id", user_id).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def get_by_email(email: str) -> Optional[Dict[str, Any]]:
        """
        Get user by email address.

        Args:
            email: User's email address

        Returns:
            Dict containing user data or None if not found
        """
        supabase = get_supabase()
        response = supabase.table("users").select("*").eq("email", email).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def get_by_google_id(google_id: str) -> Optional[Dict[str, Any]]:
        """
        Get user by Google OAuth ID.

        Args:
            google_id: Google OAuth ID

        Returns:
            Dict containing user data or None if not found
        """
        supabase = get_supabase()
        response = supabase.table("users").select("*").eq("google_id", google_id).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def update_preferences(user_id: str, preferences: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update user preferences.

        Args:
            user_id: User's UUID
            preferences: Dict of user preferences

        Returns:
            Dict containing updated user data
        """
        supabase = get_supabase()
        response = supabase.table("users").update({
            "preferences": preferences
        }).eq("id", user_id).execute()
        return response.data[0]

    @staticmethod
    def update_provider_tokens(
        user_id: str,
        provider: str,
        tokens: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update encrypted tokens for a provider within provider_connections.

        Args:
            user_id: User's UUID
            provider: Provider name ('google', 'microsoft', 'apple')
            tokens: Dict of tokens to encrypt and store, e.g.:
                {
                    'access_token': 'token123',
                    'refresh_token': 'refresh456',
                    'expires_at': datetime or ISO string
                }

        Returns:
            Dict containing updated user data

        Raises:
            ValueError: If provider connection doesn't exist
        """
        supabase = get_supabase()
        user = User.get_by_id(user_id)

        if not user:
            raise ValueError(f"User {user_id} not found")

        connections = user.get('provider_connections', [])

        # Find the provider connection
        provider_idx = None
        for idx, conn in enumerate(connections):
            if conn.get('provider') == provider:
                provider_idx = idx
                break

        if provider_idx is None:
            raise ValueError(f"Provider connection for '{provider}' not found. Add connection first.")

        # Encrypt all token values
        encrypted_tokens = {}
        for key, value in tokens.items():
            if value is None:
                continue
            # If it's expires_at, don't encrypt (it's metadata)
            if key == 'expires_at':
                if isinstance(value, datetime):
                    encrypted_tokens[key] = value.isoformat()
                elif isinstance(value, str):
                    encrypted_tokens[key] = value
                else:
                    encrypted_tokens[key] = str(value)
            # Encrypt the actual token values
            else:
                encrypted_tokens[key] = encrypt_token(str(value))

        # Update the connection with encrypted tokens
        connections[provider_idx]['encrypted_tokens'] = encrypted_tokens

        # Update database
        response = supabase.table("users").update({
            "provider_connections": connections
        }).eq("id", user_id).execute()

        return response.data[0]

    @staticmethod
    def get_provider_tokens(
        user_id: str,
        provider: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get and decrypt tokens for a provider from provider_connections.

        Args:
            user_id: User's UUID
            provider: Provider name ('google', 'microsoft', 'apple')

        Returns:
            Dict of decrypted tokens or None if not found, e.g.:
            {
                'access_token': 'decrypted_token',
                'refresh_token': 'decrypted_refresh',
                'expires_at': '2026-02-04T...'
            }
        """
        conn = User.get_provider_connection(user_id, provider)

        if not conn or 'encrypted_tokens' not in conn:
            return None

        encrypted_tokens = conn['encrypted_tokens']
        decrypted_tokens = {}

        for key, value in encrypted_tokens.items():
            if value is None:
                continue
            # expires_at is not encrypted, just metadata
            if key == 'expires_at':
                decrypted_tokens[key] = value
            # Decrypt actual token values
            else:
                decrypted_tokens[key] = decrypt_token(value)

        return decrypted_tokens

    @staticmethod
    def create_or_update_from_provider(
        user_id: str,
        provider: str,
        provider_id: str,
        email: str,
        display_name: Optional[str] = None,
        photo_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create or update user from auth provider (e.g., Google sign-in).
        Adds provider to auth_providers array if not already present.

        Args:
            user_id: Supabase auth user ID
            provider: Provider name (e.g., 'google', 'github')
            provider_id: Provider's user ID
            email: User's email from provider
            display_name: User's display name (optional)
            photo_url: URL to user's profile photo (optional)

        Returns:
            Dict containing the created/updated user data
        """
        supabase = get_supabase()

        # Check if user exists
        existing_user = User.get_by_id(user_id)

        provider_data = {
            "provider": provider,
            "provider_id": provider_id,
            "email": email,
            "linked_at": datetime.utcnow().isoformat()
        }

        if existing_user:
            # User exists - add provider if not already present
            auth_providers = existing_user.get('auth_providers', [])

            # Check if provider already exists
            provider_exists = any(
                p.get('provider') == provider and p.get('provider_id') == provider_id
                for p in auth_providers
            )

            if not provider_exists:
                auth_providers.append(provider_data)
                supabase.table("users").update({
                    "auth_providers": auth_providers
                }).eq("id", user_id).execute()

            return existing_user
        else:
            # Create new user
            data = {
                "id": user_id,  # Use Supabase auth ID as primary key
                "email": email,
                "display_name": display_name,
                "photo_url": photo_url,
                "auth_providers": [provider_data]
            }
            response = supabase.table("users").insert(data).execute()
            return response.data[0]

    @staticmethod
    def add_calendar_connection(
        user_id: str,
        provider: str,
        connection_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Add a calendar connection to user's calendar_connections array.

        Args:
            user_id: User's UUID
            provider: Calendar provider name (e.g., 'google_calendar', 'outlook')
            connection_data: Dict with provider-specific data (calendar_id, etc.)

        Returns:
            Dict containing updated user data
        """
        supabase = get_supabase()

        user = User.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")

        calendar_connections = user.get('calendar_connections', [])

        # Add timestamp
        connection_entry = {
            "provider": provider,
            **connection_data,
            "linked_at": datetime.utcnow().isoformat()
        }

        # Check if connection already exists (update if so)
        existing_idx = None
        for idx, conn in enumerate(calendar_connections):
            if conn.get('provider') == provider:
                existing_idx = idx
                break

        if existing_idx is not None:
            calendar_connections[existing_idx] = connection_entry
        else:
            calendar_connections.append(connection_entry)

        response = supabase.table("users").update({
            "calendar_connections": calendar_connections
        }).eq("id", user_id).execute()

        return response.data[0]

    @staticmethod
    def get_calendar_connection(
        user_id: str,
        provider: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get a specific calendar connection for a user.

        Args:
            user_id: User's UUID
            provider: Calendar provider name (e.g., 'google_calendar')

        Returns:
            Calendar connection dict if found, None otherwise
        """
        user = User.get_by_id(user_id)
        if not user:
            return None

        calendar_connections = user.get('calendar_connections', [])
        for conn in calendar_connections:
            if conn.get('provider') == provider:
                return conn

        return None

    @staticmethod
    def remove_calendar_connection(
        user_id: str,
        provider: str
    ) -> Dict[str, Any]:
        """
        Remove a calendar connection from user's calendar_connections array.

        Args:
            user_id: User's UUID
            provider: Calendar provider name to remove

        Returns:
            Dict containing updated user data
        """
        supabase = get_supabase()

        user = User.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")

        calendar_connections = user.get('calendar_connections', [])
        calendar_connections = [
            conn for conn in calendar_connections
            if conn.get('provider') != provider
        ]

        response = supabase.table("users").update({
            "calendar_connections": calendar_connections
        }).eq("id", user_id).execute()

        return response.data[0]

    # ========================================================================
    # Unified Provider Connection Methods (New Architecture)
    # ========================================================================

    @staticmethod
    def add_provider_connection(
        user_id: str,
        provider: str,
        provider_id: str,
        email: str,
        usage: List[str],
        display_name: Optional[str] = None,
        photo_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Add or update a provider connection with specified usage.

        Args:
            user_id: User's UUID
            provider: Provider name (e.g., 'google', 'apple_calendar')
            provider_id: Provider's user ID
            email: Email associated with this provider
            usage: List of usage types (e.g., ['auth'], ['calendar'], ['auth', 'calendar'])
            display_name: User's display name from provider (optional)
            photo_url: User's profile photo from provider (optional)

        Returns:
            Dict containing updated user data
        """
        supabase = get_supabase()
        user = User.get_by_id(user_id)

        if not user:
            raise ValueError(f"User {user_id} not found")

        connections = user.get('provider_connections', [])

        # Check if this provider connection already exists
        existing_idx = None
        for idx, conn in enumerate(connections):
            if conn.get('provider') == provider and conn.get('provider_id') == provider_id:
                existing_idx = idx
                break

        # Create connection entry
        connection = {
            "provider": provider,
            "provider_id": provider_id,
            "email": email,
            "usage": usage,
            "linked_at": datetime.utcnow().isoformat()
        }

        # Add optional fields
        if display_name:
            connection["display_name"] = display_name
        if photo_url:
            connection["photo_url"] = photo_url

        # Update or append
        if existing_idx is not None:
            connections[existing_idx] = connection
        else:
            connections.append(connection)

        # Update user
        response = supabase.table("users").update({
            "provider_connections": connections
        }).eq("id", user_id).execute()

        return response.data[0]

    @staticmethod
    def get_provider_connection(
        user_id: str,
        provider: str,
        provider_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get a specific provider connection.

        Args:
            user_id: User's UUID
            provider: Provider name to find
            provider_id: Optional specific provider ID (if user has multiple accounts from same provider)

        Returns:
            Provider connection dict if found, None otherwise
        """
        user = User.get_by_id(user_id)
        if not user:
            return None

        connections = user.get('provider_connections', [])

        for conn in connections:
            if conn.get('provider') == provider:
                # If provider_id specified, must match exactly
                if provider_id and conn.get('provider_id') != provider_id:
                    continue
                return conn

        return None

    @staticmethod
    def update_provider_usage(
        user_id: str,
        provider: str,
        usage: list
    ) -> Dict[str, Any]:
        """
        Update the usage array for a specific provider connection.

        Args:
            user_id: User's UUID
            provider: Provider name ('google', 'microsoft', 'apple')
            usage: Updated usage array (e.g., ['auth', 'calendar'])

        Returns:
            Dict containing updated user data

        Raises:
            ValueError: If provider connection doesn't exist
        """
        supabase = get_supabase()
        user = User.get_by_id(user_id)

        if not user:
            raise ValueError(f"User {user_id} not found")

        connections = user.get('provider_connections', [])

        # Find the provider connection
        provider_idx = None
        for idx, conn in enumerate(connections):
            if conn.get('provider') == provider:
                provider_idx = idx
                break

        if provider_idx is None:
            raise ValueError(f"Provider connection for '{provider}' not found")

        # Update the usage array
        connections[provider_idx]['usage'] = usage

        # Update database
        response = supabase.table("users").update({
            "provider_connections": connections
        }).eq("id", user_id).execute()

        return response.data[0]

    @staticmethod
    def get_primary_calendar_connection(user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the user's primary (active) calendar connection.

        Args:
            user_id: User's UUID

        Returns:
            Primary calendar connection dict if found, None otherwise
        """
        user = User.get_by_id(user_id)
        if not user:
            return None

        primary_provider = user.get('primary_calendar_provider')
        if not primary_provider:
            return None

        # Find the connection with this provider that has 'calendar' in usage
        connections = user.get('provider_connections', [])
        for conn in connections:
            if conn.get('provider') == primary_provider and 'calendar' in conn.get('usage', []):
                return conn

        return None

    @staticmethod
    def set_primary_calendar(user_id: str, provider: str) -> Dict[str, Any]:
        """
        Set which calendar provider is primary (active).

        Args:
            user_id: User's UUID
            provider: Provider to set as primary

        Returns:
            Dict containing updated user data
        """
        supabase = get_supabase()

        # Verify provider exists and has calendar usage
        conn = User.get_provider_connection(user_id, provider)
        if not conn:
            raise ValueError(f"Provider {provider} not connected")

        if 'calendar' not in conn.get('usage', []):
            raise ValueError(f"Provider {provider} not set up for calendar usage")

        response = supabase.table("users").update({
            "primary_calendar_provider": provider
        }).eq("id", user_id).execute()

        return response.data[0]

    @staticmethod
    def remove_provider_connection(
        user_id: str,
        provider: str,
        provider_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Remove a provider connection.

        Args:
            user_id: User's UUID
            provider: Provider name to remove
            provider_id: Optional specific provider ID

        Returns:
            Dict containing updated user data
        """
        supabase = get_supabase()
        user = User.get_by_id(user_id)

        if not user:
            raise ValueError(f"User {user_id} not found")

        connections = user.get('provider_connections', [])

        # Filter out the connection to remove
        new_connections = [
            conn for conn in connections
            if not (conn.get('provider') == provider and
                   (provider_id is None or conn.get('provider_id') == provider_id))
        ]

        response = supabase.table("users").update({
            "provider_connections": new_connections
        }).eq("id", user_id).execute()

        return response.data[0]


class Session:
    """Session model for database operations."""

    @staticmethod
    def create(user_id: str, input_type: str, input_content: str) -> Dict[str, Any]:
        """
        Create a new session.

        Args:
            user_id: User's UUID
            input_type: Type of input ('text', 'image', 'audio', 'email')
            input_content: Original text or file path

        Returns:
            Dict containing the created session data
        """
        supabase = get_supabase()

        data = {
            "user_id": user_id,
            "input_type": input_type,
            "input_content": input_content,
            "status": "pending"
        }

        response = supabase.table("sessions").insert(data).execute()
        return response.data[0]

    @staticmethod
    def get_by_id(session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get session by ID.

        Args:
            session_id: Session's UUID

        Returns:
            Dict containing session data or None if not found
        """
        supabase = get_supabase()
        response = supabase.table("sessions").select("*").eq("id", session_id).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def get_by_user(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Get all sessions for a user.

        Args:
            user_id: User's UUID
            limit: Maximum number of sessions to return (default 50)

        Returns:
            List of session dicts, ordered by created_at desc
        """
        supabase = get_supabase()
        response = supabase.table("sessions").select("*")\
            .eq("user_id", user_id)\
            .order("created_at", desc=True)\
            .limit(limit).execute()
        return response.data

    @staticmethod
    def update_status(
        session_id: str,
        status: str,
        error_message: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update session status.

        Args:
            session_id: Session's UUID
            status: New status ('pending', 'processing', 'processed', 'error')
            error_message: Error message if status is 'error' (optional)

        Returns:
            Dict containing updated session data
        """
        supabase = get_supabase()

        data = {"status": status}
        if error_message:
            data["error_message"] = error_message

        response = supabase.table("sessions").update(data).eq("id", session_id).execute()
        return response.data[0]

    @staticmethod
    def update_events(
        session_id: str,
        extracted_events: Optional[List[Dict]] = None,
        processed_events: Optional[List[Dict]] = None,
        conflicts: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Update session with processed events.

        Args:
            session_id: Session's UUID
            extracted_events: List of raw extracted events (optional)
            processed_events: List of formatted calendar events (optional)
            conflicts: List of detected conflicts (optional)

        Returns:
            Dict containing updated session data
        """
        supabase = get_supabase()

        data = {}
        if extracted_events is not None:
            data["extracted_events"] = extracted_events
        if processed_events is not None:
            data["processed_events"] = processed_events
        if conflicts is not None:
            data["conflicts"] = conflicts

        response = supabase.table("sessions").update(data).eq("id", session_id).execute()
        return response.data[0]

    @staticmethod
    def update_extracted_events(
        session_id: str,
        extracted_events: List[Dict]
    ) -> Dict[str, Any]:
        """
        Update session with extracted events (Agent 1 output).

        Args:
            session_id: Session's UUID
            extracted_events: List of raw extracted events

        Returns:
            Dict containing updated session data
        """
        supabase = get_supabase()

        response = supabase.table("sessions").update({
            "extracted_events": extracted_events,
            "status": "processing"
        }).eq("id", session_id).execute()
        return response.data[0]

    @staticmethod
    def update_processed_events(
        session_id: str,
        processed_events: List[Dict]
    ) -> Dict[str, Any]:
        """
        Update session with processed calendar events (Agent 3 output).
        Marks session as processed.

        Args:
            session_id: Session's UUID
            processed_events: List of formatted calendar events

        Returns:
            Dict containing updated session data
        """
        supabase = get_supabase()

        response = supabase.table("sessions").update({
            "processed_events": processed_events,
            "status": "processed"
        }).eq("id", session_id).execute()
        return response.data[0]

    @staticmethod
    def mark_error(session_id: str, error_message: str) -> Dict[str, Any]:
        """
        Mark session as failed with error message.

        Args:
            session_id: Session's UUID
            error_message: Error message describing what went wrong

        Returns:
            Dict containing updated session data
        """
        supabase = get_supabase()

        response = supabase.table("sessions").update({
            "status": "error",
            "error_message": error_message
        }).eq("id", session_id).execute()
        return response.data[0]

    @staticmethod
    def mark_added_to_calendar(
        session_id: str,
        calendar_event_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Mark session events as added to calendar.

        Args:
            session_id: Session's UUID
            calendar_event_ids: List of Google Calendar event IDs

        Returns:
            Dict containing updated session data
        """
        supabase = get_supabase()

        response = supabase.table("sessions").update({
            "added_to_calendar": True,
            "calendar_event_ids": calendar_event_ids,
            "status": "processed"
        }).eq("id", session_id).execute()
        return response.data[0]

    @staticmethod
    def update_title(session_id: str, title: str) -> Dict[str, Any]:
        """
        Update session title.

        Args:
            session_id: Session's UUID
            title: Generated title for the session

        Returns:
            Dict containing updated session data
        """
        supabase = get_supabase()

        response = supabase.table("sessions").update({
            "title": title
        }).eq("id", session_id).execute()
        return response.data[0]

    @staticmethod
    def delete(session_id: str) -> bool:
        """
        Delete a session.

        Args:
            session_id: Session's UUID

        Returns:
            True if deletion was successful
        """
        supabase = get_supabase()
        response = supabase.table("sessions").delete().eq("id", session_id).execute()
        return len(response.data) > 0
