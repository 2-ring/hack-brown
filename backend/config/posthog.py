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
import uuid

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


# ============================================================================
# Thread-local tracking context
# ============================================================================

# Attributes auto-included as properties on every LLM call via get_invoke_config().
# These flow from set_tracking_context() → thread-local → CallbackHandler properties
# → every $ai_generation, $ai_trace, and $ai_span event in PostHog.
_AUTO_INCLUDE_ATTRS = (
    'input_type',           # text, image, audio, pdf, document, email, modification, ...
    'is_guest',             # True/False
    'num_events',           # total events identified in session
    'has_personalization',  # whether Agent 3 ran
    'event_index',          # which event in the batch (0-indexed)
    'chunk_index',          # which chunk for chunked identification
    'calendar_name',        # calendar being analyzed (pattern discovery)
)


def set_tracking_context(
    distinct_id=None,
    trace_id=None,
    pipeline=None,
    input_type=None,
    is_guest=None,
    num_events=None,
    has_personalization=None,
    event_index=None,
    chunk_index=None,
    calendar_name=None,
):
    """
    Set the tracking context for the current thread.
    Call this before running agents so LLM calls are attributed correctly.

    All non-None values are stored in thread-local storage and automatically
    merged into every PostHog event via get_invoke_config(). Use None to
    skip updating a field (partial updates are safe).

    Args:
        distinct_id: User ID (for per-user cost tracking)
        trace_id: Groups related LLM calls (e.g., session ID)
        pipeline: Pipeline label (e.g., "Session: text", "Edit event")
        input_type: Input modality ('text', 'image', 'audio', 'pdf', etc.)
        is_guest: Whether this is a guest session
        num_events: Total events identified (set after Agent 1)
        has_personalization: Whether Agent 3 will run
        event_index: Which event in the batch (set per worker thread)
        chunk_index: Which chunk for chunked identification
        calendar_name: Calendar being analyzed (pattern discovery)
    """
    # Core fields are always set (even if None, to reset between pipelines)
    if distinct_id is not None:
        _local.distinct_id = distinct_id
    if trace_id is not None:
        _local.trace_id = trace_id
    if pipeline is not None:
        _local.pipeline = pipeline

    # Extended context: only set if provided (partial updates)
    if input_type is not None:
        _local.input_type = input_type
    if is_guest is not None:
        _local.is_guest = is_guest
    if num_events is not None:
        _local.num_events = num_events
    if has_personalization is not None:
        _local.has_personalization = has_personalization
    if event_index is not None:
        _local.event_index = event_index
    if chunk_index is not None:
        _local.chunk_index = chunk_index
    if calendar_name is not None:
        _local.calendar_name = calendar_name


def get_tracking_property(name, default=None):
    """Read a single value from the thread-local tracking context."""
    return getattr(_local, name, default)


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

    Automatically merges thread-local context (input_type, is_guest,
    num_events, event_index, etc.) into every event's properties.

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

        # Build properties from thread-local context
        merged_properties = {}
        if agent_name:
            merged_properties["agent_name"] = agent_name
        if pipeline:
            merged_properties["pipeline"] = pipeline

        # Auto-include all extended context attributes
        for attr in _AUTO_INCLUDE_ATTRS:
            val = getattr(_local, attr, None)
            if val is not None:
                merged_properties[attr] = val

        # Caller-provided properties override auto-included ones
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


# ============================================================================
# Pipeline traces and phase spans
# ============================================================================

_PHASE_LABELS = {
    'identification': 'Phase: Identification',
    'processing': 'Phase: Extraction + Personalization',
    'pattern_refresh': 'Phase: Pattern Refresh',
    'pattern_discovery': 'Phase: Pattern Discovery',
}


def capture_pipeline_trace(
    session_id,
    input_type,
    is_guest,
    outcome,
    num_events=0,
    has_personalization=False,
    duration_ms=0,
    error_message=None,
):
    """
    Capture a manual $ai_trace event representing a full pipeline execution.
    Provides the top-level view in PostHog's LLM observability trace viewer.

    Args:
        session_id: Session/trace ID (groups all events in this pipeline)
        input_type: Input modality ('text', 'image', 'audio', etc.)
        is_guest: Whether this is a guest session
        outcome: 'success', 'error', or 'no_events'
        num_events: Number of events created
        has_personalization: Whether Agent 3 ran
        duration_ms: Total pipeline duration in milliseconds
        error_message: Error message if outcome is 'error'
    """
    client = _ensure_client()
    if not client:
        return

    try:
        distinct_id = getattr(_local, 'distinct_id', None) or 'anonymous'
        guest_suffix = ' (guest)' if is_guest else ''

        event_properties = {
            '$ai_trace_id': session_id,
            '$ai_span_id': str(uuid.uuid4()),
            '$ai_span_name': f"Pipeline: {input_type}{guest_suffix}",
            '$ai_latency': duration_ms / 1000,
            '$ai_framework': 'dropcal',
            'pipeline': f"Session: {input_type}{guest_suffix}",
            'input_type': input_type,
            'is_guest': is_guest,
            'outcome': outcome,
            'num_events': num_events,
            'has_personalization': has_personalization,
        }

        if outcome == 'error':
            event_properties['$ai_is_error'] = True
            event_properties['$ai_error'] = error_message or 'Unknown error'

        client.capture(
            distinct_id=distinct_id,
            event='$ai_trace',
            properties=event_properties,
        )
    except Exception as e:
        logger.debug(f"PostHog: Failed to capture pipeline trace: {e}")


def capture_phase_span(
    phase_name,
    session_id,
    duration_ms,
    outcome='success',
    properties=None,
):
    """
    Capture a manual $ai_span event representing a phase within a pipeline.
    E.g., identification phase, processing (extraction + personalization) phase.

    Args:
        phase_name: Phase identifier ('identification', 'processing', etc.)
        session_id: Parent trace ID (the pipeline trace)
        duration_ms: Phase duration in milliseconds
        outcome: 'success', 'error', or 'no_events'
        properties: Optional dict of phase-specific metadata
    """
    client = _ensure_client()
    if not client:
        return

    try:
        distinct_id = getattr(_local, 'distinct_id', None) or 'anonymous'

        event_properties = {
            '$ai_trace_id': session_id,
            '$ai_parent_id': session_id,
            '$ai_span_id': str(uuid.uuid4()),
            '$ai_span_name': _PHASE_LABELS.get(phase_name, phase_name),
            '$ai_latency': duration_ms / 1000,
            '$ai_framework': 'dropcal',
            'phase': phase_name,
            'outcome': outcome,
        }

        # Include thread-local context
        for attr in ('input_type', 'is_guest'):
            val = getattr(_local, attr, None)
            if val is not None:
                event_properties[attr] = val

        if properties:
            event_properties.update(properties)

        if outcome == 'error':
            event_properties['$ai_is_error'] = True

        client.capture(
            distinct_id=distinct_id,
            event='$ai_span',
            properties=event_properties,
        )
    except Exception as e:
        logger.debug(f"PostHog: Failed to capture phase span: {e}")


# ============================================================================
# Utilities
# ============================================================================

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

        event_properties = {
            '$ai_trace_id': trace_id,
            'agent_name': agent_name,
            'error_type': type(error).__name__,
            'error_message': str(error),
        }

        # Include thread-local context for richer error events
        for attr in _AUTO_INCLUDE_ATTRS:
            val = getattr(_local, attr, None)
            if val is not None:
                event_properties[attr] = val

        if extra:
            event_properties.update(extra)

        client.capture(
            distinct_id=distinct_id,
            event='$ai_generation',
            properties={
                **event_properties,
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
