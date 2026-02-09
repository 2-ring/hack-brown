"""
Processing limits configuration.
Controls input size limits, event caps, parallelism, and timeouts.
"""

import os
from config.limits import TextLimits, EventLimits


class ProcessingConfig:
    """Configuration for input processing limits and parallelism."""

    # Maximum characters allowed for text input
    MAX_TEXT_INPUT_LENGTH: int = TextLimits.MAX_TEXT_INPUT_LENGTH

    # Maximum events to process per request (after Agent 1 identification)
    MAX_EVENTS_PER_REQUEST: int = EventLimits.MAX_EVENTS_PER_REQUEST

    # Max concurrent threads for Agent 2 + Agent 3 pipeline per request
    MAX_WORKERS: int = int(os.getenv('DROPCAL_MAX_WORKERS', '5'))

    # Timeout per individual event processing (Agent 2 + Agent 3), in seconds
    PER_EVENT_TIMEOUT: int = 60

    # Total timeout for entire batch of events, in seconds
    BATCH_TIMEOUT: int = 300

    # --- Text Chunking (Agent 1) ---

    # Minimum text length (chars) before chunking kicks in
    CHUNK_THRESHOLD: int = 15_000

    # Target size per chunk in characters
    CHUNK_TARGET_SIZE: int = 15_000

    # Overlap between adjacent chunks in characters
    CHUNK_OVERLAP: int = 500

    # Max concurrent threads for chunked Agent 1 calls
    CHUNK_MAX_WORKERS: int = 3

    # Timeout per chunk for Agent 1 (seconds)
    CHUNK_PER_TIMEOUT: int = 45

    # Total timeout for all chunks (seconds)
    CHUNK_BATCH_TIMEOUT: int = 120

    # Minimum SequenceMatcher ratio to consider two events duplicates
    DEDUP_SIMILARITY_THRESHOLD: float = 0.85

    # Chunking window boundaries (as multipliers of CHUNK_TARGET_SIZE)
    CHUNK_WINDOW_MIN_RATIO: float = 0.5   # Window starts at 50% of target
    CHUNK_WINDOW_MAX_RATIO: float = 1.3   # Window ends at 130% of target

    @classmethod
    def get_text_limit_error_message(cls, actual_length: int) -> str:
        return (
            f"Input text is too long ({actual_length:,} characters). "
            f"Maximum allowed is {cls.MAX_TEXT_INPUT_LENGTH:,} characters. "
            f"Please shorten your input or split it into multiple requests."
        )

    @classmethod
    def get_events_truncation_warning(cls, total_found: int) -> str:
        return (
            f"Found {total_found} events but only the first "
            f"{cls.MAX_EVENTS_PER_REQUEST} will be processed. "
            f"Please submit remaining events in a separate request."
        )
