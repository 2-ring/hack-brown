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
        'document': [
            # Word
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            # PowerPoint
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            # Excel
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            # Web/data
            'text/html', 'text/csv', 'text/tab-separated-values',
            'application/json', 'text/xml', 'application/xml',
            # eBook
            'application/epub+zip',
            # Rich text
            'application/rtf', 'text/rtf',
        ],
        'text': ['text/plain', 'text/markdown'],
        'email': ['message/rfc822'],
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

        # Upload to Supabase Storage (read bytes from file-like objects)
        file_data = file.read() if hasattr(file, 'read') else file
        response = supabase.storage.from_(FileStorage.BUCKET_NAME)\
            .upload(unique_filename, file_data)

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
    def detect_file_type(mimetype: str, filename: str = '') -> Optional[str]:
        """
        Auto-detect file type category from MIME type or filename extension.

        Returns the category key ('image', 'audio', 'pdf', 'document')
        or None if the file type is not supported.
        """
        # Check MIME type against all categories
        for category, mimes in FileStorage.ALLOWED_TYPES.items():
            if mimetype in mimes:
                return category

        # Fallback: check file extension for common types
        ext = os.path.splitext(filename)[1].lower() if filename else ''
        EXT_MAP = {
            '.docx': 'document', '.pptx': 'document', '.xlsx': 'document',
            '.html': 'document', '.htm': 'document', '.csv': 'document',
            '.json': 'document', '.xml': 'document', '.epub': 'document',
            '.rtf': 'document', '.tsv': 'document', '.ipynb': 'document',
            '.txt': 'text', '.text': 'text', '.md': 'text', '.markdown': 'text',
            '.eml': 'email', '.email': 'email',
        }
        return EXT_MAP.get(ext)

    @staticmethod
    def validate_file_type(mimetype: str, expected_type: str) -> bool:
        """
        Validate if file type is allowed.

        Args:
            mimetype: MIME type of the file
            expected_type: Expected file type category ('image', 'audio', 'pdf', 'document')

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
