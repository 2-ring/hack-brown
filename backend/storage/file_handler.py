"""
File storage handler for Supabase Storage.
Manages file uploads, downloads, and deletions.
"""

import os
from typing import Optional, BinaryIO
from uuid import uuid4
from database.supabase_client import get_supabase


class FileStorage:
    """Handle file uploads to Supabase Storage."""

    BUCKET_NAME = "uploads"
    ALLOWED_TYPES = {
        'image': ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'],
        'audio': [
            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm',
            'audio/ogg', 'audio/m4a', 'audio/x-m4a', 'audio/mp4', 'audio/flac',
        ],
        'pdf': ['application/pdf'],
    }

    @staticmethod
    def upload_file(
        file: BinaryIO,
        filename: str,
        user_id: str,
        file_type: str
    ) -> str:
        """
        Upload file to Supabase Storage.

        Args:
            file: Binary file object to upload
            filename: Original filename
            user_id: User's UUID for organizing files
            file_type: Type of file ('image', 'audio', 'document')

        Returns:
            str: The storage path of the uploaded file

        Raises:
            Exception: If upload fails
        """
        supabase = get_supabase()

        # Generate unique filename with extension
        ext = os.path.splitext(filename)[1]
        unique_filename = f"{user_id}/{uuid4()}{ext}"

        # Upload to Supabase Storage
        response = supabase.storage.from_(FileStorage.BUCKET_NAME)\
            .upload(unique_filename, file)

        # Return the path (we'll construct URLs in the app)
        return unique_filename

    @staticmethod
    def get_file_url(file_path: str, expires_in: int = 3600) -> str:
        """
        Get a signed URL for a file (valid for 1 hour by default).

        Args:
            file_path: Path to file in storage
            expires_in: URL expiration time in seconds (default 3600 = 1 hour)

        Returns:
            str: Signed URL for accessing the file
        """
        supabase = get_supabase()

        response = supabase.storage.from_(FileStorage.BUCKET_NAME)\
            .create_signed_url(file_path, expires_in)

        return response['signedURL']

    @staticmethod
    def download_file(file_path: str) -> bytes:
        """
        Download file from storage.

        Args:
            file_path: Path to file in storage

        Returns:
            bytes: File content as bytes
        """
        supabase = get_supabase()

        response = supabase.storage.from_(FileStorage.BUCKET_NAME)\
            .download(file_path)

        return response

    @staticmethod
    def delete_file(file_path: str) -> bool:
        """
        Delete file from storage.

        Args:
            file_path: Path to file in storage

        Returns:
            bool: True if deletion was successful, False otherwise
        """
        supabase = get_supabase()

        try:
            supabase.storage.from_(FileStorage.BUCKET_NAME).remove([file_path])
            return True
        except Exception:
            return False

    @staticmethod
    def validate_file_type(mimetype: str, expected_type: str) -> bool:
        """
        Validate if file type is allowed.

        Args:
            mimetype: MIME type of the file
            expected_type: Expected file type category ('image', 'audio', 'document')

        Returns:
            bool: True if file type is allowed, False otherwise
        """
        allowed = FileStorage.ALLOWED_TYPES.get(expected_type, [])
        return mimetype in allowed

    @staticmethod
    def list_user_files(user_id: str) -> list:
        """
        List all files uploaded by a user.

        Args:
            user_id: User's UUID

        Returns:
            list: List of file objects in the user's folder
        """
        supabase = get_supabase()

        try:
            response = supabase.storage.from_(FileStorage.BUCKET_NAME)\
                .list(user_id)
            return response
        except Exception:
            return []
