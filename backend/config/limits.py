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
    MAX_DOCUMENT_SIZE_MB: int = 10

    # Global Flask upload limit (bytes) — must be >= largest per-type limit
    MAX_UPLOAD_BYTES: int = MAX_AUDIO_SIZE_MB * 1024 * 1024


class EventLimits:
    """Caps on event counts."""

    # Max events IDENTIFY stage can return per request
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
