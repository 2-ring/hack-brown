"""
Database models for User and Session operations.
Provides CRUD operations for Supabase tables.
"""

import secrets
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
    def get_by_email_prefix(prefix: str) -> Optional[Dict[str, Any]]:
        """
        Get user by email prefix (the part before @).
        Used for resolving inbound email addresses like lucas@events.dropcal.ai → lucas@gmail.com user.

        Args:
            prefix: The local part of the email (e.g., 'lucas')

        Returns:
            Dict containing user data or None if not found
        """
        supabase = get_supabase()
        response = supabase.table("users").select("*").like("email", f"{prefix}@%").limit(1).execute()
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
    def create(user_id: str, input_type: str, input_content: str, guest_mode: bool = False) -> Dict[str, Any]:
        """
        Create a new session.

        Args:
            user_id: User's UUID (or guest_<uuid> for guest sessions)
            input_type: Type of input ('text', 'image', 'audio', 'email')
            input_content: Original text or file path
            guest_mode: Whether this is a guest session (default: False)

        Returns:
            Dict containing the created session data (includes access_token for guest sessions)
        """
        supabase = get_supabase()

        data = {
            "user_id": user_id,
            "input_type": input_type,
            "input_content": input_content,
            "status": "pending",
            "guest_mode": guest_mode
        }

        # Generate secure access token for guest sessions
        if guest_mode:
            data["access_token"] = secrets.token_hex(32)  # 64-char hex string

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
    def verify_guest_token(session_id: str, access_token: str) -> Optional[Dict[str, Any]]:
        """
        Verify guest session access token and return session if valid.

        Args:
            session_id: Session's UUID
            access_token: Access token to verify

        Returns:
            Dict containing session data if token is valid, None otherwise
        """
        supabase = get_supabase()

        response = supabase.table("sessions").select("*")\
            .eq("id", session_id)\
            .eq("guest_mode", True)\
            .eq("access_token", access_token)\
            .execute()

        return response.data[0] if response.data else None

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

    @staticmethod
    def add_event(session_id: str, event_id: str) -> Dict[str, Any]:
        """
        Add an event ID to session's event_ids array.

        Args:
            session_id: Session's UUID
            event_id: Event UUID to add

        Returns:
            Dict containing updated session data
        """
        supabase = get_supabase()

        # Get current event_ids
        session = Session.get_by_id(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        event_ids = session.get('event_ids', [])
        if event_id not in event_ids:
            event_ids.append(event_id)

        response = supabase.table("sessions").update({
            "event_ids": event_ids
        }).eq("id", session_id).execute()
        return response.data[0]


class Event:
    """Event model for unified event storage."""

    @staticmethod
    def create(
        user_id: str,
        provider: str,
        summary: str,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        is_all_day: bool = False,
        is_draft: bool = False,
        provider_account_id: Optional[str] = None,
        provider_event_id: Optional[str] = None,
        description: Optional[str] = None,
        location: Optional[str] = None,
        timezone: Optional[str] = None,
        calendar_name: Optional[str] = None,
        color_id: Optional[str] = None,
        original_input: Optional[str] = None,
        extracted_facts: Optional[Dict] = None,
        system_suggestion: Optional[Dict] = None,
        event_embedding: Optional[List[float]] = None
    ) -> Dict[str, Any]:
        """
        Create a new event.

        Args:
            user_id: User's UUID
            provider: Event provider ('dropcal', 'google', etc.)
            summary: Event title
            start_time: Start timestamp (for non-all-day events)
            end_time: End timestamp (for non-all-day events)
            start_date: Start date (for all-day events)
            end_date: End date (for all-day events)
            is_all_day: Whether event is all-day
            is_draft: Whether event is draft (only for dropcal)
            provider_account_id: Provider account email (NULL for dropcal)
            provider_event_id: Provider's event ID
            description: Event description
            location: Event location
            timezone: IANA timezone
            calendar_name: Calendar name
            color_id: Color ID
            original_input: Original raw input (for dropcal events)
            extracted_facts: Agent 2 output (for dropcal events)
            system_suggestion: Agent 5 output (for dropcal events)
            event_embedding: 384-dim embedding vector

        Returns:
            Dict containing the created event data
        """
        supabase = get_supabase()

        data = {
            "user_id": user_id,
            "provider": provider,
            "summary": summary,
            "is_all_day": is_all_day,
            "is_draft": is_draft
        }

        # Optional fields
        if provider_account_id:
            data["provider_account_id"] = provider_account_id
        if provider_event_id:
            data["provider_event_id"] = provider_event_id
        if start_time:
            data["start_time"] = start_time
        if end_time:
            data["end_time"] = end_time
        if start_date:
            data["start_date"] = start_date
        if end_date:
            data["end_date"] = end_date
        if description:
            data["description"] = description
        if location:
            data["location"] = location
        if timezone:
            data["timezone"] = timezone
        if calendar_name:
            data["calendar_name"] = calendar_name
        if color_id:
            data["color_id"] = color_id
        if original_input:
            data["original_input"] = original_input
        if extracted_facts:
            data["extracted_facts"] = extracted_facts
        if system_suggestion:
            data["system_suggestion"] = system_suggestion
        if event_embedding:
            data["event_embedding"] = event_embedding

        response = supabase.table("events").insert(data).execute()
        return response.data[0]

    @staticmethod
    def get_by_id(event_id: str) -> Optional[Dict[str, Any]]:
        """Get event by ID."""
        supabase = get_supabase()
        response = supabase.table("events").select("*").eq("id", event_id).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def get_by_user(
        user_id: str,
        provider: Optional[str] = None,
        is_draft: Optional[bool] = None,
        limit: int = 500
    ) -> List[Dict[str, Any]]:
        """
        Get events for a user.

        Args:
            user_id: User's UUID
            provider: Filter by provider (optional)
            is_draft: Filter by draft status (optional)
            limit: Maximum number to return

        Returns:
            List of event dicts
        """
        supabase = get_supabase()

        query = supabase.table("events").select("*").eq("user_id", user_id).is_("deleted_at", None)

        if provider:
            query = query.eq("provider", provider)
        if is_draft is not None:
            query = query.eq("is_draft", is_draft)

        response = query.order("created_at", desc=True).limit(limit).execute()
        return response.data

    @staticmethod
    def get_historical_events(
        user_id: str,
        limit: int = 500
    ) -> List[Dict[str, Any]]:
        """Get historical events (from providers, not dropcal) for pattern learning."""
        supabase = get_supabase()
        response = supabase.table("events").select("*")\
            .eq("user_id", user_id)\
            .neq("provider", "dropcal")\
            .is_("deleted_at", None)\
            .order("start_time", desc=True)\
            .limit(limit).execute()
        return response.data

    @staticmethod
    def get_pending_drafts(user_id: str) -> List[Dict[str, Any]]:
        """Get dropcal events pending user review."""
        supabase = get_supabase()
        response = supabase.table("events").select("*")\
            .eq("user_id", user_id)\
            .eq("provider", "dropcal")\
            .eq("is_draft", True)\
            .is_("deleted_at", None)\
            .order("created_at", desc=True).execute()
        return response.data

    @staticmethod
    def update(event_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update event fields.

        Args:
            event_id: Event UUID
            updates: Dict of fields to update

        Returns:
            Dict containing updated event data
        """
        supabase = get_supabase()
        response = supabase.table("events").update(updates).eq("id", event_id).execute()
        return response.data[0]

    @staticmethod
    def increment_version(event_id: str) -> Dict[str, Any]:
        """
        Increment the version counter for an event.
        Called on every user edit to track changes for provider sync.

        Args:
            event_id: Event UUID

        Returns:
            Dict containing updated event data
        """
        supabase = get_supabase()
        event = Event.get_by_id(event_id)
        if not event:
            raise ValueError(f"Event {event_id} not found")

        new_version = (event.get('version') or 1) + 1
        response = supabase.table("events").update({
            "version": new_version
        }).eq("id", event_id).execute()
        return response.data[0]

    @staticmethod
    def confirm_draft(
        event_id: str,
        user_edits: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Confirm a draft event, optionally with user edits.

        Args:
            event_id: Event UUID
            user_edits: Dict of user modifications (optional)

        Returns:
            Dict containing updated event data
        """
        supabase = get_supabase()

        updates = {"is_draft": False}

        if user_edits:
            # User made changes - mark as modified and track corrections
            updates["user_modified"] = True
            updates.update(user_edits)

            # Add to correction_history
            event = Event.get_by_id(event_id)
            correction_history = event.get('correction_history', [])

            correction_entry = {
                "timestamp": datetime.utcnow().isoformat(),
                "changes": user_edits
            }
            correction_history.append(correction_entry)
            updates["correction_history"] = correction_history

        response = supabase.table("events").update(updates).eq("id", event_id).execute()
        return response.data[0]

    @staticmethod
    def soft_delete(event_id: str) -> Dict[str, Any]:
        """Soft delete an event."""
        supabase = get_supabase()
        response = supabase.table("events").update({
            "deleted_at": datetime.utcnow().isoformat()
        }).eq("id", event_id).execute()
        return response.data[0]

    @staticmethod
    def get_conflicting_events(
        user_id: str,
        start_time: str,
        end_time: str
    ) -> List[Dict[str, Any]]:
        """
        Get events that conflict with the given time range.

        Args:
            user_id: User's UUID
            start_time: Start timestamp (ISO format)
            end_time: End timestamp (ISO format)

        Returns:
            List of conflicting events
        """
        supabase = get_supabase()

        # Use the get_conflicting_events SQL function
        response = supabase.rpc('get_conflicting_events', {
            'p_user_id': user_id,
            'p_start_time': start_time,
            'p_end_time': end_time
        }).execute()

        return response.data

    @staticmethod
    def find_similar_events(
        user_id: str,
        query_embedding: List[float],
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Find similar events using vector similarity search.

        Args:
            user_id: User's UUID
            query_embedding: 384-dim embedding vector
            limit: Number of similar events to return

        Returns:
            List of similar events with similarity scores
        """
        supabase = get_supabase()

        # Query using cosine distance
        # Note: Supabase pgvector uses <=> operator for cosine distance
        response = supabase.rpc('find_similar_events', {
            'p_user_id': user_id,
            'p_embedding': query_embedding,
            'p_limit': limit
        }).execute()

        return response.data

    @staticmethod
    def get_by_provider_event_id(
        user_id: str,
        provider: str,
        provider_event_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get event by provider event ID.

        Args:
            user_id: User's UUID
            provider: Provider name ('google', 'microsoft', etc.)
            provider_event_id: Provider's event ID

        Returns:
            Event dict or None if not found
        """
        supabase = get_supabase()
        response = supabase.table("events").select("*")\
            .eq("user_id", user_id)\
            .eq("provider", provider)\
            .eq("provider_event_id", provider_event_id)\
            .is_("deleted_at", None)\
            .maybe_single().execute()
        return response.data

    @staticmethod
    def get_user_event_stats(
        user_id: str,
        provider: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get event statistics for sync decision making.

        Args:
            user_id: User's UUID
            provider: Optional provider filter

        Returns:
            Dict with statistics:
            {
                'total': int,
                'most_recent': str (ISO timestamp),
                'oldest': str (ISO timestamp)
            }
        """
        supabase = get_supabase()

        query = supabase.table("events").select("start_time")\
            .eq("user_id", user_id)\
            .is_("deleted_at", None)

        if provider:
            query = query.eq("provider", provider)

        response = query.not_.is_("start_time", None)\
            .order("start_time", desc=True).execute()

        events = response.data

        if not events:
            return {
                'total': 0,
                'most_recent': None,
                'oldest': None
            }

        return {
            'total': len(events),
            'most_recent': events[0]['start_time'] if events else None,
            'oldest': events[-1]['start_time'] if events else None
        }

    @staticmethod
    def count_user_events(
        user_id: str,
        provider: Optional[str] = None
    ) -> int:
        """
        Count total events for a user.

        Args:
            user_id: User's UUID
            provider: Optional provider filter

        Returns:
            Total event count
        """
        supabase = get_supabase()

        query = supabase.table("events").select("id", count="exact")\
            .eq("user_id", user_id)\
            .is_("deleted_at", None)

        if provider:
            query = query.eq("provider", provider)

        response = query.execute()
        return response.count if response.count else 0
