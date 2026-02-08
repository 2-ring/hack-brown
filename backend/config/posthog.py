"""
PostHog Analytics Configuration
LLM observability, cost tracking, and product analytics.
"""

import os
import logging
import threading

logger = logging.getLogger(__name__)

_posthog_client = None
_local = threading.local()


def init_posthog():
    """Initialize the PostHog client. Call once at app startup."""
    global _posthog_client

    api_key = os.getenv('POSTHOG_API_KEY')
    if not api_key:
        logger.info("PostHog: POSTHOG_API_KEY not set, analytics disabled")
        return

    try:
        from posthog import Posthog

        host = os.getenv('POSTHOG_HOST', 'https://us.i.posthog.com')
        _posthog_client = Posthog(api_key, host=host)
        logger.info(f"PostHog: Initialized (host={host})")
    except ImportError:
        logger.warning("PostHog: posthog package not installed, analytics disabled")
    except Exception as e:
        logger.warning(f"PostHog: Failed to initialize: {e}")


def set_tracking_context(distinct_id=None, trace_id=None):
    """
    Set the tracking context for the current thread.
    Call this before running agents so LLM calls are attributed correctly.

    Args:
        distinct_id: User ID (for per-user cost tracking)
        trace_id: Groups related LLM calls (e.g., session ID)
    """
    _local.distinct_id = distinct_id
    _local.trace_id = trace_id


def get_invoke_config():
    """
    Get LangChain invoke config with PostHog callback.
    Returns empty dict if PostHog is not configured.

    Usage:
        result = chain.invoke(input, config=get_invoke_config())
    """
    if not _posthog_client:
        return {}

    try:
        from posthog.ai.langchain import CallbackHandler

        distinct_id = getattr(_local, 'distinct_id', None) or 'anonymous'
        trace_id = getattr(_local, 'trace_id', None)

        callback = CallbackHandler(
            client=_posthog_client,
            distinct_id=distinct_id,
            trace_id=trace_id,
            privacy_mode=False,
        )
        return {"callbacks": [callback]}
    except ImportError:
        return {}
    except Exception as e:
        logger.debug(f"PostHog: Failed to create callback: {e}")
        return {}


def get_posthog_client():
    """Get the raw PostHog client for custom events (feature flags, etc.)."""
    return _posthog_client
