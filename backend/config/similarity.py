"""
Embedding, similarity search, and pattern discovery configuration.
"""


class EmbeddingConfig:
    """Sentence transformer and embedding settings."""

    MODEL_NAME: str = 'all-MiniLM-L6-v2'
    MAX_SEQ_LENGTH: int = 128           # Calendar events are short
    CORRECTION_MAX_SEQ_LENGTH: int = 256  # Correction facts need more context
    FAISS_BATCH_SIZE: int = 32
    KEYWORD_CACHE_SIZE: int = 1000
    QUERY_CACHE_SIZE_LIMIT: int = 1000
    LENGTH_SIMILARITY_DECAY_T: float = 3.0  # exp(-diff / T)


class PatternDiscoveryConfig:
    """Pattern discovery and sampling settings."""

    # Sampling
    TARGET_SAMPLE_SIZE: int = 100
    LLM_MAX_EVENTS: int = 50           # Max events shown to LLM per category
    RECENCY_BIAS_DEFAULT: float = 0.6
    LOCATION_DISPLAY_MAX_LENGTH: int = 50

    # Recency-weighted sampling tiers
    RECENT_TIER_BOUNDARY: float = 0.75  # Last 25% of events
    MID_TIER_BOUNDARY: float = 0.40     # Middle 35% of events
    MIN_SAMPLE_PER_TIER: float = 0.05   # At least 5% from each tier
    MID_TIER_ALLOCATION_WEIGHT: float = 0.75  # 75% of non-recency allocation


class EvaluationConfig:
    """Similarity evaluation thresholds and defaults."""

    DEFAULT_K: int = 10
    SAME_FORMAT_SIMILARITY_THRESHOLD: float = 0.3  # Jaccard overlap for same-format check
    TARGET_PRECISION: float = 0.80
    TARGET_RECALL: float = 0.60
    TARGET_MRR: float = 0.70
