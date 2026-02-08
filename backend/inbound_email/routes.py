import os
import hmac
import logging
import threading

from flask import Blueprint, jsonify, request, current_app

from database.models import User, Session as DBSession
from inbound_email.parser import build_email_text

logger = logging.getLogger(__name__)

inbound_email_bp = Blueprint('inbound_email', __name__, url_prefix='/api/webhook')


def _verify_webhook_secret(req) -> bool:
    """Verify the request is from our Cloudflare Worker via shared secret."""
    secret = req.headers.get('X-Webhook-Secret', '')
    expected = os.getenv('CLOUDFLARE_WEBHOOK_SECRET', '')
    if not expected:
        logger.error("CLOUDFLARE_WEBHOOK_SECRET not configured")
        return False
    return hmac.compare_digest(secret, expected)


def _resolve_user(local_part: str):
    """Resolve an email local part to a user. Returns None for guest aliases."""
    if local_part.startswith('guest'):
        return None
    return User.get_by_email_prefix(local_part)


@inbound_email_bp.route('/inbound-email', methods=['POST'])
def receive_inbound_email():
    """
    Webhook endpoint for Cloudflare Email Worker.

    Receives parsed email data, resolves the recipient to a DropCal user,
    and feeds the email content into the session processing pipeline.

    Expected JSON payload:
    {
        "from": "sender@example.com",
        "to": "username@events.dropcal.ai",
        "subject": "Team standup Thursday at 10am",
        "text_body": "Reminder about standup...",
        "html_body": "<html>...</html>",
        "attachments": []
    }
    """
    # 1. Verify webhook secret
    if not _verify_webhook_secret(request):
        return jsonify({'error': 'Unauthorized'}), 401

    # 2. Parse payload
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid JSON payload'}), 400

    to_address = data.get('to', '')
    subject = data.get('subject', '')
    text_body = data.get('text_body', '')
    html_body = data.get('html_body', '')

    # 3. Extract local part from to address
    if '@' not in to_address:
        return jsonify({'error': 'Invalid to address'}), 400

    local_part = to_address.split('@')[0]
    if not local_part:
        return jsonify({'error': 'Empty recipient'}), 400

    # 4. Resolve user
    user = _resolve_user(local_part)
    if not user:
        logger.info(f"No user found for email alias: {local_part}")
        return jsonify({
            'status': 'accepted',
            'processed': False,
            'reason': 'No matching user'
        }), 200

    user_id = user['id']

    # 5. Build processable text
    email_text = build_email_text(subject, text_body, html_body)
    if not email_text.strip():
        logger.info(f"Empty email body from {data.get('from', 'unknown')} to {to_address}")
        return jsonify({
            'status': 'accepted',
            'processed': False,
            'reason': 'Empty email content'
        }), 200

    # 6. Create session and process
    session_processor = current_app.session_processor
    session = DBSession.create(
        user_id=user_id,
        input_type='email',
        input_content=email_text
    )

    thread = threading.Thread(
        target=session_processor.process_text_session,
        args=(session['id'], email_text)
    )
    thread.daemon = True
    thread.start()

    logger.info(f"Inbound email session created: {session['id']} for user {user_id}")

    return jsonify({
        'status': 'accepted',
        'processed': True,
        'session_id': session['id']
    }), 202
