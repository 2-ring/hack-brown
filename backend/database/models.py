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
    def update_google_tokens(
        user_id: str,
        access_token: str,
        refresh_token: Optional[str] = None,
        expires_at: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Update user's Google Calendar API tokens.

        Args:
            user_id: User's UUID
            access_token: Google access token
            refresh_token: Google refresh token (optional)
            expires_at: Token expiration datetime (optional)

        Returns:
            Dict containing updated user data
        """
        supabase = get_supabase()

        # Encrypt tokens before storing
        data = {"google_access_token": encrypt_token(access_token)}
        if refresh_token:
            data["google_refresh_token"] = encrypt_token(refresh_token)
        if expires_at:
            data["token_expires_at"] = expires_at.isoformat()

        response = supabase.table("users").update(data).eq("id", user_id).execute()
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
