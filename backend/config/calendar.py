"""
Calendar sync and data collection configuration.
"""


class SyncConfig:
    """Calendar sync strategy thresholds."""

    # Minutes since last sync before allowing re-sync
    SKIP_IF_SYNCED_WITHIN_MINUTES: int = 2

    # Fast incremental sync threshold (minutes)
    FAST_INCREMENTAL_THRESHOLD_MINUTES: int = 60

    # Max results per API page
    MAX_RESULTS_INCREMENTAL: int = 250
    MAX_RESULTS_FULL: int = 2500


class CollectionConfig:
    """Data collection for pattern analysis."""

    # Quick collection
    QUICK_MAX_EVENTS: int = 250
    QUICK_MIN_EVENTS_THRESHOLD: int = 30   # Extend timeframe if below this

    # Deep collection
    DEEP_RECENT_MAX: int = 200
    DEEP_MIN_RECENT_FOR_HISTORICAL: int = 20
    DEEP_HISTORICAL_SAMPLE_SIZE: int = 150
    MIN_EVENTS_PER_MONTH_SAMPLED: int = 5

    # Comprehensive collection
    COMPREHENSIVE_MAX_PER_CALENDAR: int = 10000  # Safety cap

    # Pagination
    API_PAGE_SIZE: int = 250

    # Rate limiting between API calls
    API_RATE_LIMIT_DELAY_SECONDS: float = 0.1

    # Calendar list/event defaults
    DEFAULT_LIST_EVENTS_LIMIT: int = 100
    DEFAULT_CALENDAR_LIST_LIMIT: int = 10
