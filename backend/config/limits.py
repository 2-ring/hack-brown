"""
File size limits, event caps, and validation constants.
Single source of truth — import from here instead of hardcoding.
"""


class FileLimits:
    """Maximum file sizes in bytes and MB for each input type."""

    # Per-type limits (MB) — for binary file uploads
    MAX_IMAGE_SIZE_MB: int = 20
    MAX_AUDIO_SIZE_MB: int = 25
    MAX_PDF_SIZE_MB: int = 20
    MAX_TEXT_FILE_SIZE_MB: int = 10

    # Global Flask upload limit (bytes) — must be >= largest per-type limit
    MAX_UPLOAD_BYTES: int = MAX_AUDIO_SIZE_MB * 1024 * 1024

    # Allowed MIME types for file upload endpoint (binary files only)
    # Text-based files (.txt, .md, .eml) are read client-side and sent via text session path
    ALLOWED_MIME_TYPES: dict[str, list[str]] = {
        'image': [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
        ],
        'audio': [
            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm',
            'audio/ogg', 'audio/m4a', 'audio/x-m4a', 'audio/mp4',
            'audio/flac',
        ],
        'pdf': [
            'application/pdf',
        ],
    }

    # Allowed file extensions for upload endpoint
    ALLOWED_EXTENSIONS: dict[str, list[str]] = {
        'image': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
        'audio': ['.mp3', '.wav', '.m4a', '.webm', '.ogg', '.mpeg', '.mpga', '.mp4', '.flac'],
        'pdf': ['.pdf'],
    }


class EventLimits:
    """Caps on event counts."""

    # Max events Agent 1 can return per request
    MAX_EVENTS_PER_REQUEST: int = 25

    # Max events for pattern discovery endpoint
    MAX_EVENTS_FOR_PATTERN_DISCOVERY: int = 500

    # Minimum events before pattern discovery is allowed
    MIN_EVENTS_FOR_PATTERN_DISCOVERY: int = 10


class TextLimits:
    """Character and text length limits."""

    # Max characters for direct text input
    MAX_TEXT_INPUT_LENGTH: int = 50_000

    # Hard cap on event title length
    EVENT_TITLE_MAX_LENGTH: int = 100

    # Max words for auto-generated session title
    SESSION_TITLE_MAX_WORDS: int = 3

    # Min text length for PDF text extraction to be considered successful
    PDF_MIN_TEXT_LENGTH: int = 50


class PDFLimits:
    """PDF-specific processing limits."""

    # Max pages to render to images for vision processing
    MAX_PAGES_TO_RENDER: int = 5

    # DPI for PDF-to-image rendering
    RENDER_DPI: int = 150
