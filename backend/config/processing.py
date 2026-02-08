"""
Processing limits configuration.
Controls input size limits, event caps, parallelism, and timeouts.
"""

import os


class ProcessingConfig:
    """Configuration for input processing limits and parallelism."""

    # Maximum characters allowed for text input
    MAX_TEXT_INPUT_LENGTH: int = 50_000

    # Maximum events to process per request (after Agent 1 identification)
    MAX_EVENTS_PER_REQUEST: int = 25

    # Max concurrent threads for Agent 2 + Agent 3 pipeline per request
    MAX_WORKERS: int = int(os.getenv('DROPCAL_MAX_WORKERS', '5'))

    # Timeout per individual event processing (Agent 2 + Agent 3), in seconds
    PER_EVENT_TIMEOUT: int = 60

    # Total timeout for entire batch of events, in seconds
    BATCH_TIMEOUT: int = 300

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
