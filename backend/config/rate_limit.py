"""
Rate limiting configuration for guest endpoints.
Supports both in-memory (development) and Redis (production) storage.
"""

import os
from typing import Optional


class RateLimitConfig:
    """Rate limiting configuration."""

    # Storage backend
    REDIS_URL: Optional[str] = os.getenv('REDIS_URL')
    USE_REDIS: bool = REDIS_URL is not None

    # Authenticated user defaults (applied globally by Flask-Limiter)
    AUTHENTICATED_LIMITS = ["2000 per day", "500 per hour"]

    # Rate limits for guest endpoints
    GUEST_CREATE_LIMIT = "10 per hour"  # Creating guest sessions
    GUEST_FETCH_LIMIT = "50 per hour"   # Fetching guest sessions
    DEFAULT_LIMITS = ["200 per day", "50 per hour"]

    @classmethod
    def get_storage_uri(cls) -> str:
        """
        Get storage URI for Flask-Limiter.

        Returns:
            Redis URL if configured, otherwise in-memory storage.
        """
        if cls.USE_REDIS:
            return cls.REDIS_URL
        else:
            return "memory://"

    @classmethod
    def is_production(cls) -> bool:
        """Check if running in production mode (using Redis)."""
        return cls.USE_REDIS


# Production deployment note:
# Set REDIS_URL environment variable to enable Redis:
#   export REDIS_URL="redis://localhost:6379"
#   or
#   export REDIS_URL="redis://:password@redis-host:6379/0"
