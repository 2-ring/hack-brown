"""
Database query limits and defaults.
Controls pagination, batch sizes, and default result counts.
"""


class QueryLimits:
    """Default limits for database queries."""

    # Session queries
    DEFAULT_SESSION_LIMIT: int = 50

    # Event queries
    DEFAULT_EVENT_LIMIT: int = 500
    DEFAULT_HISTORICAL_EVENTS_LIMIT: int = 500
    DEFAULT_EVENTS_WITH_EMBEDDINGS_LIMIT: int = 200
    DEFAULT_SIMILAR_EVENTS_LIMIT: int = 10

    # Embedding computation
    EMBEDDING_BATCH_SIZE: int = 100

    # Personalization context
    PERSONALIZATION_HISTORICAL_LIMIT: int = 200

    # Guest sessions
    GUEST_TOKEN_BYTES: int = 32  # produces 64-char hex string


class StreamConfig:
    """Server-sent event stream polling configuration."""

    # Max polls for SSE stream (MAX_POLLS * POLL_INTERVAL = max stream duration)
    MAX_POLLS: int = 100
    POLL_INTERVAL_SECONDS: float = 0.1  # 100ms
