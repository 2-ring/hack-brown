"""
Session routes for real-time updates via Server-Sent Events (SSE).
Provides streaming updates for session titles as they're generated.
"""

from flask import Blueprint, Response, jsonify
from database.models import Session as DBSession
import json
import time

sessions_bp = Blueprint('sessions', __name__, url_prefix='/sessions')


@sessions_bp.route('/<session_id>/stream', methods=['GET'])
def stream_session_updates(session_id: str):
    """
    Server-Sent Events endpoint for streaming session updates.

    Streams title updates as soon as they're generated in the background.
    Frontend opens an EventSource connection to this endpoint and receives
    real-time updates as the session is processed.

    Args:
        session_id: Session ID to stream updates for

    Event types:
        - title: New title has been generated
        - status: Session status changed
        - complete: Session processing complete
        - error: Error occurred

    Example frontend usage:
        const eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);
        eventSource.addEventListener('title', (e) => {
            const data = JSON.parse(e.data);
            updateSidebarTitle(data.title);
        });
    """
    def generate():
        """Generator function for SSE stream"""
        # Get initial session state
        session = DBSession.get_by_id(session_id)
        if not session:
            yield f"event: error\ndata: {json.dumps({'error': 'Session not found'})}\n\n"
            return

        # Send initial state
        init_data = {
            'id': session_id,
            'status': session.get('status'),
            'title': session.get('title')
        }
        yield f"event: init\ndata: {json.dumps(init_data)}\n\n"

        # Poll for updates (title generation usually takes 50-400ms)
        last_title = session.get('title')
        last_status = session.get('status')
        from config.database import StreamConfig
        max_polls = StreamConfig.MAX_POLLS
        polls = 0

        while polls < max_polls:
            time.sleep(StreamConfig.POLL_INTERVAL_SECONDS)
            polls += 1

            # Check for updates
            session = DBSession.get_by_id(session_id)
            if not session:
                break

            current_title = session.get('title')
            current_status = session.get('status')

            # Title updated!
            if current_title and current_title != last_title:
                data = json.dumps({'title': current_title, 'timestamp': time.time()})
                yield f"event: title\ndata: {data}\n\n"
                last_title = current_title

            # Status changed
            if current_status != last_status:
                data = json.dumps({'status': current_status, 'timestamp': time.time()})
                yield f"event: status\ndata: {data}\n\n"
                last_status = current_status

                # If processed or error, end stream
                if current_status in ['processed', 'error']:
                    data = json.dumps({
                        'status': current_status,
                        'has_events': len(session.get('event_ids') or session.get('processed_events') or []) > 0
                    })
                    yield f"event: complete\ndata: {data}\n\n"
                    break

        # Timeout reached
        if polls >= max_polls:
            yield f"event: timeout\ndata: {json.dumps({'message': 'Stream timeout'})}\n\n"

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',  # Disable nginx buffering
            'Connection': 'keep-alive'
        }
    )


@sessions_bp.route('/<session_id>', methods=['DELETE'])
def delete_session(session_id: str):
    """
    Delete a session.

    Args:
        session_id: Session UUID

    Returns:
        JSON with success message
    """
    success = DBSession.delete(session_id)

    if not success:
        return jsonify({'error': 'Session not found'}), 404

    return jsonify({'message': 'Session deleted successfully'})
