"""
Session routes for real-time updates via Server-Sent Events (SSE).

Streams events, titles, and status updates directly from the pipeline
to the frontend — no polling or DB round-trips needed.
"""

from flask import Blueprint, Response, jsonify
from database.models import Session as DBSession
from processing.stream import get_stream, cleanup_stream
from events.service import EventService
import json
import time

sessions_bp = Blueprint('sessions', __name__, url_prefix='/sessions')


@sessions_bp.route('/<session_id>/stream', methods=['GET'])
def stream_session_updates(session_id: str):
    """
    SSE endpoint for real-time session updates.

    Reads from the in-memory stream (pushed by the pipeline) and sends
    events to the frontend as they become ready. Falls back to DB polling
    if no stream exists (e.g., reconnecting to an already-running session).

    Event types:
        - init: Initial session state
        - event: A calendar event is ready (sent as list of all current events)
        - title: Title has been generated
        - complete: Pipeline finished, events saved to DB
        - error: Pipeline failed

    Frontend usage:
        const es = new EventSource(`/api/sessions/${id}/stream`);
        es.addEventListener('event', (e) => setEvents(JSON.parse(e.data).events));
        es.addEventListener('complete', () => { es.close(); });
    """
    def generate():
        session = DBSession.get_by_id_lite(session_id)
        if not session:
            yield f"event: error\ndata: {json.dumps({'error': 'Session not found'})}\n\n"
            return

        # Send initial state
        yield f"event: init\ndata: {json.dumps({'id': session_id, 'status': session.get('status'), 'title': session.get('title'), 'icon': session.get('icon')})}\n\n"

        # If already processed, send events from DB and close
        if session.get('status') == 'processed':
            events = EventService.get_events_by_session(session_id)
            yield f"event: event\ndata: {json.dumps({'events': events})}\n\n"
            yield f"event: complete\ndata: {json.dumps({'status': 'processed'})}\n\n"
            return
        if session.get('status') == 'error':
            yield f"event: error\ndata: {json.dumps({'error': session.get('error_message', 'Processing failed')})}\n\n"
            return

        # Stream from in-memory pipeline
        stream = get_stream(session_id)
        if not stream:
            # No stream — fall back to DB polling
            yield from _poll_db_fallback(session_id, session)
            return

        last_event_count = 0
        last_title = session.get('title')
        last_icon = session.get('icon')
        max_wait = 300  # 5 min max
        heartbeat_interval = 15  # Send keepalive every 15s
        last_heartbeat = time.time()

        start = time.time()
        while time.time() - start < max_wait:
            stream.wait_for_update(timeout=0.5)

            sent_data = False

            # Title update
            if stream.title and stream.title != last_title:
                yield f"event: title\ndata: {json.dumps({'title': stream.title})}\n\n"
                last_title = stream.title
                sent_data = True

            # Icon update
            if stream.icon and stream.icon != last_icon:
                yield f"event: icon\ndata: {json.dumps({'icon': stream.icon})}\n\n"
                last_icon = stream.icon
                sent_data = True

            # New events available
            current_count = len(stream.events)
            if current_count > last_event_count:
                yield f"event: event\ndata: {json.dumps({'events': list(stream.events)})}\n\n"
                last_event_count = current_count
                sent_data = True

            # Error
            if stream.error:
                yield f"event: error\ndata: {json.dumps({'error': stream.error})}\n\n"
                cleanup_stream(session_id)
                return

            # Done
            if stream.done:
                # Send final events (may have been updated by personalization)
                if len(stream.events) != last_event_count or last_event_count == 0:
                    yield f"event: event\ndata: {json.dumps({'events': list(stream.events)})}\n\n"
                yield f"event: complete\ndata: {json.dumps({'status': 'processed'})}\n\n"
                cleanup_stream(session_id)
                return

            # Heartbeat to keep connection alive through ALB/Nginx
            now = time.time()
            if not sent_data and now - last_heartbeat >= heartbeat_interval:
                yield ":heartbeat\n\n"
                last_heartbeat = now

        # Timeout
        yield f"event: timeout\ndata: {json.dumps({'message': 'Stream timeout'})}\n\n"
        cleanup_stream(session_id)

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        }
    )


def _poll_db_fallback(session_id, session):
    """Fallback: poll DB for status changes (no in-memory stream available)."""
    last_title = session.get('title')
    last_icon = session.get('icon')
    last_status = session.get('status')
    from config.database import StreamConfig
    max_polls = StreamConfig.MAX_POLLS
    heartbeat_interval = 15
    last_heartbeat = time.time()

    for _ in range(max_polls):
        time.sleep(StreamConfig.POLL_INTERVAL_SECONDS)

        session = DBSession.get_by_id_lite(session_id)
        if not session:
            break

        sent_data = False
        current_title = session.get('title')
        current_status = session.get('status')

        if current_title and current_title != last_title:
            yield f"event: title\ndata: {json.dumps({'title': current_title})}\n\n"
            last_title = current_title
            sent_data = True

        current_icon = session.get('icon')
        if current_icon and current_icon != last_icon:
            yield f"event: icon\ndata: {json.dumps({'icon': current_icon})}\n\n"
            last_icon = current_icon
            sent_data = True

        if current_status != last_status:
            yield f"event: status\ndata: {json.dumps({'status': current_status})}\n\n"
            last_status = current_status
            sent_data = True

            if current_status in ['processed', 'error']:
                if current_status == 'processed':
                    events = EventService.get_events_by_session(session_id)
                    yield f"event: event\ndata: {json.dumps({'events': events})}\n\n"
                yield f"event: complete\ndata: {json.dumps({'status': current_status})}\n\n"
                return

        # Heartbeat to keep connection alive through ALB/Nginx
        now = time.time()
        if not sent_data and now - last_heartbeat >= heartbeat_interval:
            yield ":heartbeat\n\n"
            last_heartbeat = now

    yield f"event: timeout\ndata: {json.dumps({'message': 'Stream timeout'})}\n\n"


@sessions_bp.route('/<session_id>', methods=['DELETE'])
def delete_session(session_id: str):
    """Delete a session."""
    success = DBSession.delete(session_id)
    if not success:
        return jsonify({'error': 'Session not found'}), 404
    return jsonify({'message': 'Session deleted successfully'})
