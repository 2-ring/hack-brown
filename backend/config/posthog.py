"""
PostHog Analytics Configuration
LLM observability, cost tracking, and product analytics.

IMPORTANT: The PostHog client is lazily initialized on first use, NOT at
import time. This is critical for Gunicorn with --preload: the app module
loads in the master process which then forks workers. The PostHog SDK's
internal consumer thread does not survive fork, so creating the client
before fork means events are queued but never sent. Lazy init ensures the
client (and its consumer thread) are created inside the worker process.
"""

import os
import atexit
import logging
import threading

logger = logging.getLogger(__name__)

_posthog_client = None
_posthog_initialized = False
_init_lock = threading.Lock()
_local = threading.local()


def _ensure_client():
    """
    Lazily initialize the PostHog client on first use.
    Thread-safe via lock. Returns the client or None.
    """
    global _posthog_client, _posthog_initialized

    if _posthog_initialized:
        return _posthog_client

    with _init_lock:
        # Double-check after acquiring lock
        if _posthog_initialized:
            return _posthog_client

        api_key = os.getenv('POSTHOG_API_KEY')
        if not api_key:
            logger.info("PostHog: POSTHOG_API_KEY not set, analytics disabled")
            _posthog_initialized = True
            return None

        try:
            from posthog import Posthog

            host = os.getenv('POSTHOG_HOST', 'https://us.i.posthog.com')
            _posthog_client = Posthog(api_key, host=host)
            atexit.register(_posthog_client.shutdown)
            logger.info(f"PostHog: Initialized in pid {os.getpid()} (host={host})")
        except ImportError:
            logger.warning("PostHog: posthog package not installed, analytics disabled")
        except Exception as e:
            logger.warning(f"PostHog: Failed to initialize: {e}")

        _posthog_initialized = True
        return _posthog_client


def init_posthog():
    """
    No-op kept for backwards compatibility.
    The client is lazily initialized on first use inside the worker process.
    """
    pass


def set_tracking_context(distinct_id=None, trace_id=None, pipeline=None):
    """
    Set the tracking context for the current thread.
    Call this before running agents so LLM calls are attributed correctly.

    Args:
        distinct_id: User ID (for per-user cost tracking)
        trace_id: Groups related LLM calls (e.g., session ID)
        pipeline: Pipeline label (e.g., "Session: text", "Edit event")
    """
    _local.distinct_id = distinct_id
    _local.trace_id = trace_id
    _local.pipeline = pipeline


# Human-readable labels for each agent, used as run_name in PostHog UI.
_AGENT_LABELS = {
    'identification': 'Agent 1: Identification',
    'extraction': 'Agent 2: Extraction',
    'personalization': 'Agent 3: Personalization',
    'formatting': 'Agent 3: Formatting',
    'modification': 'Agent 4: Modification',
    'pattern_discovery': 'Pattern Discovery',
    'pattern_analysis': 'Pattern Analysis',
}


def get_invoke_config(agent_name=None, properties=None):
    """
    Get LangChain invoke config with PostHog callback.
    Returns empty dict if PostHog is not configured.

    Args:
        agent_name: Name of the agent making the call (e.g., "identification", "extraction").
                    Attached as a property for per-agent filtering in the PostHog dashboard.
        properties: Optional dict of additional properties to attach to the LLM event.

    Usage:
        result = chain.invoke(input, config=get_invoke_config("formatting"))
    """
    client = _ensure_client()
    if not client:
        return {}

    try:
        from posthog.ai.langchain import CallbackHandler

        distinct_id = getattr(_local, 'distinct_id', None) or 'anonymous'
        trace_id = getattr(_local, 'trace_id', None)
        pipeline = getattr(_local, 'pipeline', None)

        merged_properties = {}
        if agent_name:
            merged_properties["agent_name"] = agent_name
        if pipeline:
            merged_properties["pipeline"] = pipeline
        if properties:
            merged_properties.update(properties)

        callback = CallbackHandler(
            client=client,
            distinct_id=distinct_id,
            trace_id=trace_id,
            properties=merged_properties or None,
            privacy_mode=False,
        )

        config = {"callbacks": [callback]}

        # Set run_name so PostHog shows a descriptive label instead of "RunnableSequence"
        if agent_name:
            config["run_name"] = _AGENT_LABELS.get(agent_name, agent_name)

        return config
    except ImportError:
        return {}
    except Exception as e:
        logger.debug(f"PostHog: Failed to create callback: {e}")
        return {}


def flush_posthog():
    """Flush buffered PostHog events. Call after a pipeline run completes."""
    client = _ensure_client()
    if client:
        try:
            client.flush()
        except Exception as e:
            logger.warning(f"PostHog: Flush failed: {e}")


def capture_agent_error(agent_name: str, error: Exception, extra: dict = None):
    """
    Capture an agent execution error as a PostHog event.
    Shows up alongside LLM generation events for full pipeline visibility.

    Args:
        agent_name: Which agent failed (e.g., "identification", "extraction")
        error: The exception that occurred
        extra: Optional dict of additional properties (session_id, event_index, etc.)
    """
    client = _ensure_client()
    if not client:
        return

    try:
        distinct_id = getattr(_local, 'distinct_id', None) or 'anonymous'
        trace_id = getattr(_local, 'trace_id', None)

        properties = {
            '$ai_trace_id': trace_id,
            'agent_name': agent_name,
            'error_type': type(error).__name__,
            'error_message': str(error),
        }
        if extra:
            properties.update(extra)

        client.capture(
            distinct_id=distinct_id,
            event='$ai_generation',
            properties={
                **properties,
                '$ai_is_error': True,
                '$ai_provider': 'pipeline',
                '$ai_model': f'agent:{agent_name}',
            },
        )
    except Exception as e:
        logger.debug(f"PostHog: Failed to capture error event: {e}")


def get_posthog_client():
    """Get the raw PostHog client for custom events (feature flags, etc.)."""
    return _ensure_client()
