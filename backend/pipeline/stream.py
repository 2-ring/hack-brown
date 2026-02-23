"""
In-memory event stream for real-time session updates via SSE.

The pipeline pushes events here as they're resolved/personalized.
The SSE endpoint reads from here and streams to the frontend.
"""

import threading
from typing import Optional, Dict, List, Any


class SessionStream:
    """Thread-safe stream for a single session's events."""

    def __init__(self):
        self.events: List[Dict[str, Any]] = []
        self.title: Optional[str] = None
        self.icon: Optional[str] = None
        self.done = False
        self.error: Optional[str] = None
        self._condition = threading.Condition()

    def push_event(self, event_data: Dict[str, Any]):
        with self._condition:
            self.events.append(event_data)
            self._condition.notify_all()

    def set_title(self, title: str):
        with self._condition:
            self.title = title
            self._condition.notify_all()

    def set_icon(self, icon: str):
        with self._condition:
            self.icon = icon
            self._condition.notify_all()

    def mark_done(self):
        with self._condition:
            self.done = True
            self._condition.notify_all()

    def mark_error(self, error: str):
        with self._condition:
            self.error = error
            self.done = True
            self._condition.notify_all()

    def wait_for_update(self, timeout: float = 1.0) -> bool:
        """Block until notified or timeout. Returns True if notified."""
        with self._condition:
            return self._condition.wait(timeout=timeout)


# Global registry of active session streams
_streams: Dict[str, SessionStream] = {}
_lock = threading.Lock()


def init_stream(session_id: str) -> SessionStream:
    """Create a stream for a session (call before starting the pipeline)."""
    stream = SessionStream()
    with _lock:
        _streams[session_id] = stream
    return stream


def get_stream(session_id: str) -> Optional[SessionStream]:
    """Get the stream for a session (returns None if not found)."""
    with _lock:
        return _streams.get(session_id)


def cleanup_stream(session_id: str):
    """Remove a completed session's stream."""
    with _lock:
        _streams.pop(session_id, None)
