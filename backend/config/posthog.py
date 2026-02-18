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
import time as _time
import uuid
from contextlib import contextmanager

logger = logging.getLogger(__name__)

_posthog_client = None
_posthog_initialized = False
_init_lock = threading.Lock()
_local = threading.local()

# Sentinel: pass to set_tracking_context to explicitly clear a field
# (None = "don't update", CLEAR = "reset to None").
CLEAR = object()

# Detected once at import time — included on every PostHog event for filtering.
_ENVIRONMENT = os.getenv('ENVIRONMENT', 'development')


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
    'has_personalization',  # whether PERSONALIZE stage ran
    'event_index',          # which event in the batch (0-indexed)
    'chunk_index',          # which chunk for chunked identification
    'calendar_name',        # calendar being analyzed (pattern discovery)
)


def _set(field, value):
    """Set a thread-local field. CLEAR resets to None, None is a no-op."""
    if value is CLEAR:
        setattr(_local, field, None)
    elif value is not None:
        setattr(_local, field, value)


def set_tracking_context(
    distinct_id=None,
    trace_id=None,
    session_id=None,
    pipeline=None,
    input_type=None,
    is_guest=None,
    num_events=None,
    has_personalization=None,
    event_index=None,
    event_description=None,
    chunk_index=None,
    calendar_name=None,
    parent_id=None,
    group_index=None,
    num_groups=None,
    group_category=None,
):
    """
    Set the tracking context for the current thread.
    Call this before running agents so LLM calls are attributed correctly.

    Pass None to skip a field (partial updates). Pass CLEAR to reset a field.

    PostHog hierarchy:
        session_id → $ai_session_id  (groups multiple traces, e.g., pipeline + modifications)
        trace_id   → $ai_trace_id    (root of one operation: a pipeline run or a modification)
        parent_id  → $ai_parent_id   (nests under a stage span within a trace)

    For pipeline runs: session_id = trace_id = DropCal session UUID.
    For modifications: session_id = DropCal session UUID, trace_id = unique edit UUID.
    """
    # Core fields
    if distinct_id is not None:
        _local.distinct_id = distinct_id
    if trace_id is not None:
        _local.trace_id = trace_id
    _set('session_id', session_id)
    if pipeline is not None:
        _local.pipeline = pipeline

    # Extended context
    _set('input_type', input_type)
    _set('is_guest', is_guest)
    _set('num_events', num_events)
    _set('has_personalization', has_personalization)
    _set('event_index', event_index)
    _set('event_description', event_description)
    _set('chunk_index', chunk_index)
    _set('calendar_name', calendar_name)
    _set('parent_id', parent_id)
    _set('group_index', group_index)
    _set('num_groups', num_groups)
    _set('group_category', group_category)


def get_tracking_property(name, default=None):
    """Read a single value from the thread-local tracking context."""
    return getattr(_local, name, default)


def _get_session_id():
    """
    Get the AI session ID for PostHog grouping.
    Returns session_id if set, otherwise falls back to trace_id.
    """
    return getattr(_local, 'session_id', None) or getattr(_local, 'trace_id', None)


# Human-readable labels for each pipeline stage / component.
_AGENT_LABELS = {
    'extraction': 'Extract',
    'personalization': 'Personalize',
    'modification': 'Modify',
    'pattern_discovery': 'Pattern Discovery',
    'pattern_analysis': 'Pattern Analysis',
}

# Maps stage_name → config component, so get_invoke_config() can resolve
# the actual provider (grok/claude/openai) instead of the LangChain class name.
_AGENT_TO_COMPONENT = {
    'extraction': 'extract',
    'personalization': 'personalize',
    'modification': 'modify',
    'pattern_discovery': 'pattern_discovery',
    'pattern_analysis': 'pattern_discovery',
}

# Display names for input types in pipeline trace names.
_INPUT_TYPE_DISPLAY = {
    'text': 'Text',
    'pdf': 'File (PDF)',
    'audio': 'File (Audio)',
    'image': 'File (Image)',
    'document': 'File (Document)',
    'email': 'File (Email)',
}


def _truncate(s, max_len=50):
    return s[:max_len] + '…' if len(s) > max_len else s


# PostHog calculates costs from $ai_provider + $ai_model.  Grok uses the
# OpenAI-compatible API, and PostHog only has pricing tables for "openai"
# provider — not "grok".  Map so costs show up correctly.
_PROVIDER_TO_POSTHOG = {
    'grok': 'openai',
    'claude': 'anthropic',
    'openai': 'openai',
}


def _build_span_name(agent_name):
    """
    Build a descriptive span name from thread-local context.

    Always includes the stage label so traces are scannable:
        Group context  → Structure: "Errands" (Group 1/3)
        Event context  → Personalize: "1:1 with Manager" (Event 6/9)
        No context     → Identify
    """
    label = _AGENT_LABELS.get(agent_name, agent_name)

    # Group context (batch Structure)
    group_index = getattr(_local, 'group_index', None)
    num_groups = getattr(_local, 'num_groups', None)
    group_category = getattr(_local, 'group_category', None)

    if group_index is not None and num_groups:
        desc = f'"{_truncate(group_category)}" ' if group_category else ''
        return f'{label}: {desc}(Group {group_index + 1}/{num_groups})'

    # Event context (per-event Structure, Personalize)
    event_index = getattr(_local, 'event_index', None)
    num_events = getattr(_local, 'num_events', None)
    event_description = getattr(_local, 'event_description', None)

    if event_index is not None and num_events:
        desc = f'"{_truncate(event_description)}" ' if event_description else ''
        return f'{label}: {desc}(Event {event_index + 1}/{num_events})'

    return label


def get_invoke_config(agent_name=None, properties=None):
    """
    Get LangChain invoke config with PostHog callback.
    Returns empty dict if PostHog is not configured.

    Automatically merges thread-local context (input_type, is_guest,
    num_events, event_index, etc.) into every event's properties.

    If parent_id is set in the tracking context, the LangChain callback
    will nest under that parent (e.g., an event span) while still grouping
    under the pipeline trace via $ai_trace_id.

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
        session_id = _get_session_id()
        parent_id = getattr(_local, 'parent_id', None)
        pipeline = getattr(_local, 'pipeline', None)

        # Build properties from thread-local context
        merged_properties = {'environment': _ENVIRONMENT}

        # $ai_session_id groups all traces (pipeline + modifications) into one AI session
        if session_id:
            merged_properties['$ai_session_id'] = str(session_id)

        if agent_name:
            merged_properties["agent_name"] = agent_name
        if pipeline:
            merged_properties["pipeline"] = pipeline

        # Resolve actual provider (grok/claude/openai) from agent → component mapping
        # so PostHog shows the real provider instead of the LangChain class name
        component = _AGENT_TO_COMPONENT.get(agent_name)
        if component:
            try:
                from config.text import get_text_provider, get_model_specs
                provider = get_text_provider(component)
                merged_properties['provider'] = provider
                merged_properties['model'] = get_model_specs(provider)['model_name']
            except Exception:
                pass

        # Auto-include all extended context attributes
        for attr in _AUTO_INCLUDE_ATTRS:
            val = getattr(_local, attr, None)
            if val is not None:
                merged_properties[attr] = val

        # Caller-provided properties override auto-included ones
        if properties:
            merged_properties.update(properties)

        # If parent_id is set, use it as the callback's trace_id so the
        # LangChain chain root becomes a child of the event span.
        # Override $ai_trace_id in properties to maintain session-level grouping.
        callback_trace_id = trace_id
        if parent_id:
            callback_trace_id = parent_id
            if trace_id:
                merged_properties['$ai_trace_id'] = str(trace_id)

        callback = CallbackHandler(
            client=client,
            distinct_id=distinct_id,
            trace_id=callback_trace_id,
            properties=merged_properties or None,
            privacy_mode=False,
        )
        # Suppress internal LangChain chain spans (RunnableLambda,
        # RunnableSequence, etc.) — they clutter the PostHog trace
        # without adding useful info.  LLM generations still captured.
        callback.ignore_chain = True

        config = {"callbacks": [callback]}

        # Set run_name so PostHog shows a descriptive label instead of "RunnableSequence"
        if agent_name:
            config["run_name"] = _build_span_name(agent_name)

        return config
    except ImportError:
        return {}
    except Exception as e:
        logger.debug(f"PostHog: Failed to create callback: {e}")
        return {}


# ============================================================================
# Pipeline traces and event spans
# ============================================================================

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
    Uses session_id as $ai_span_id so all children can reference it as parent.

    Args:
        session_id: Session/trace ID (groups all events in this pipeline)
        input_type: Input modality ('text', 'image', 'audio', etc.)
        is_guest: Whether this is a guest session
        outcome: 'success', 'error', or 'no_events'
        num_events: Number of events created
        has_personalization: Whether PERSONALIZE stage ran
        duration_ms: Total pipeline duration in milliseconds
        error_message: Error message if outcome is 'error'
    """
    client = _ensure_client()
    if not client:
        return

    try:
        distinct_id = getattr(_local, 'distinct_id', None) or 'anonymous'
        guest_suffix = ' (guest)' if is_guest else ''
        display_type = _INPUT_TYPE_DISPLAY.get(input_type, input_type.title())

        event_properties = {
            '$ai_trace_id': session_id,
            '$ai_session_id': str(session_id),
            '$ai_span_id': str(session_id),
            '$ai_span_name': f"Pipeline: {display_type}{guest_suffix}",
            '$ai_latency': duration_ms / 1000,
            '$ai_framework': 'dropcal',
            'environment': _ENVIRONMENT,
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


@contextmanager
def stage_span(stage_name):
    """
    Context manager that wraps a pipeline stage in a PostHog $ai_span.

    Creates a tree structure in PostHog's trace view:
        Pipeline: Text (trace)
        ├── Extract (span)
        │   └── Extract (generation)    ← LLM call nests here via parent_id
        ├── Personalize: Event 1/3 (span)
        │   └── Personalize (generation)
        └── ...

    Sets parent_id in tracking context so LLM calls within the span
    automatically nest under it. Restores previous parent_id on exit.

    Usage:
        with stage_span("extraction"):
            result = extractor.execute(...)
    """
    span_id = str(uuid.uuid4())
    # Build name at entry time (context may change during execution)
    span_name = _build_span_name(stage_name)
    previous_parent_id = getattr(_local, 'parent_id', None)
    start = _time.time()

    # Set parent_id so child LLM calls nest under this span
    _local.parent_id = span_id

    try:
        yield span_id
    finally:
        duration_ms = (_time.time() - start) * 1000

        # Restore previous parent_id
        _local.parent_id = previous_parent_id

        # Capture the span event
        client = _ensure_client()
        if client:
            try:
                distinct_id = getattr(_local, 'distinct_id', None) or 'anonymous'
                trace_id = getattr(_local, 'trace_id', None)
                session_id = _get_session_id()

                event_properties = {
                    '$ai_trace_id': str(trace_id) if trace_id else None,
                    '$ai_session_id': str(session_id) if session_id else None,
                    '$ai_parent_id': str(previous_parent_id or trace_id) if (previous_parent_id or trace_id) else None,
                    '$ai_span_id': span_id,
                    '$ai_span_name': span_name,
                    '$ai_latency': duration_ms / 1000,
                    '$ai_framework': 'dropcal',
                    'environment': _ENVIRONMENT,
                    'agent_name': stage_name,
                }

                for attr in _AUTO_INCLUDE_ATTRS:
                    val = getattr(_local, attr, None)
                    if val is not None:
                        event_properties[attr] = val

                client.capture(
                    distinct_id=distinct_id,
                    event='$ai_span',
                    properties=event_properties,
                )
            except Exception as e:
                logger.debug(f"PostHog: Failed to capture stage span: {e}")


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
        session_id = _get_session_id()
        parent_id = getattr(_local, 'parent_id', None)

        event_properties = {
            '$ai_trace_id': str(trace_id) if trace_id else None,
            '$ai_session_id': str(session_id) if session_id else None,
            '$ai_span_id': str(uuid.uuid4()),
            '$ai_parent_id': str(parent_id or trace_id) if (parent_id or trace_id) else None,
            '$ai_span_name': _build_span_name(agent_name),
            'environment': _ENVIRONMENT,
            'agent_name': agent_name,
            'error_type': type(error).__name__,
            'error_message': str(error),
        }

        pipeline = getattr(_local, 'pipeline', None)
        if pipeline:
            event_properties['pipeline'] = pipeline

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
                '$ai_provider': 'dropcal',
                '$ai_model': f'agent:{agent_name}',
                '$ai_framework': 'dropcal',
            },
        )
    except Exception as e:
        logger.debug(f"PostHog: Failed to capture error event: {e}")


def capture_llm_generation(
    agent_name: str,
    model: str,
    provider: str,
    duration_ms: float = 0,
    properties: dict = None,
    input_tokens: int = None,
    output_tokens: int = None,
    input_content=None,
    output_content=None,
):
    """
    Capture a successful LLM generation event for non-LangChain calls (e.g., Instructor).
    Mirrors the $ai_generation events that the LangChain CallbackHandler produces.

    Automatically reads parent_id from thread-local context to nest under
    event spans when processing per-event.

    Args:
        agent_name: Which agent made the call (e.g., "extraction")
        model: Model name (e.g., "grok-3")
        provider: Provider name (e.g., "grok", "claude")
        duration_ms: Call duration in milliseconds
        properties: Optional additional properties
        input_tokens: Number of input/prompt tokens (for cost calculation)
        output_tokens: Number of output/completion tokens (for cost calculation)
        input_content: Input messages/text (string or list of message dicts)
        output_content: Output text/JSON (string or dict)
    """
    client = _ensure_client()
    if not client:
        return

    try:
        distinct_id = getattr(_local, 'distinct_id', None) or 'anonymous'
        trace_id = getattr(_local, 'trace_id', None)
        session_id = _get_session_id()
        parent_id = getattr(_local, 'parent_id', None)
        pipeline = getattr(_local, 'pipeline', None)

        # Parent: stage span if set, otherwise pipeline trace
        effective_parent = parent_id or trace_id

        event_properties = {
            '$ai_trace_id': str(trace_id) if trace_id else None,
            '$ai_session_id': str(session_id) if session_id else None,
            '$ai_span_id': str(uuid.uuid4()),
            '$ai_parent_id': str(effective_parent) if effective_parent else None,
            '$ai_span_name': _build_span_name(agent_name),
            '$ai_provider': _PROVIDER_TO_POSTHOG.get(provider, provider),
            '$ai_model': model,
            '$ai_latency': duration_ms / 1000 if duration_ms else None,
            '$ai_framework': 'dropcal',
            'environment': _ENVIRONMENT,
            'agent_name': agent_name,
        }

        # Token counts (PostHog calculates costs server-side from tokens + model)
        if input_tokens is not None:
            event_properties['$ai_input_tokens'] = input_tokens
        if output_tokens is not None:
            event_properties['$ai_output_tokens'] = output_tokens

        # Input/output content for trace inspection.
        # PostHog expects $ai_input as a list of message dicts and
        # $ai_output_choices as a list of completion dicts.
        if input_content is not None:
            if isinstance(input_content, list):
                # Already formatted as message dicts
                event_properties['$ai_input'] = input_content
            else:
                event_properties['$ai_input'] = [
                    {"role": "user", "content": str(input_content)}
                ]
        if output_content is not None:
            if isinstance(output_content, list):
                event_properties['$ai_output_choices'] = output_content
            else:
                event_properties['$ai_output_choices'] = [
                    {"role": "assistant", "content": str(output_content)}
                ]

        if pipeline:
            event_properties['pipeline'] = pipeline

        for attr in _AUTO_INCLUDE_ATTRS:
            val = getattr(_local, attr, None)
            if val is not None:
                event_properties[attr] = val

        if properties:
            event_properties.update(properties)

        client.capture(
            distinct_id=distinct_id,
            event='$ai_generation',
            properties=event_properties,
        )
    except Exception as e:
        logger.debug(f"PostHog: Failed to capture LLM generation: {e}")


def get_posthog_client():
    """Get the raw PostHog client for custom events (feature flags, etc.)."""
    return _ensure_client()
