"""
Google Calendar Integration API Routes
Handles OAuth, event creation, conflict checking, and calendar operations.
"""

from flask import Blueprint, jsonify, request, redirect
from typing import Optional

from .service import CalendarService
from calendar import factory
from calendar.google import auth as google_auth  # Still needed for legacy token storage endpoint
from auth.middleware import require_auth

# Create blueprint
calendar_bp = Blueprint('calendar', __name__)

# Initialize calendar service
calendar_service = CalendarService()


def resolve_calendar_name_to_id(calendar_name: str, calendar_service: CalendarService) -> Optional[str]:
    """
    Resolve human-readable calendar name to Google Calendar ID.

    Args:
        calendar_name: Name like "Classes", "UAPPLY", "Default", "Primary"
        calendar_service: CalendarService instance

    Returns:
        Calendar ID if found, None if not found (caller defaults to 'primary')
    """
    try:
        # Handle special case: "Default" or "Primary" → 'primary'
        if calendar_name.lower() in ['default', 'primary']:
            return 'primary'

        # Get user's calendar list
        calendars = calendar_service.get_calendar_list()

        # Find matching calendar (case-insensitive)
        for cal in calendars:
            cal_name = cal.get('summary', '')
            cal_id = cal.get('id', '')

            if cal_name.lower() == calendar_name.lower():
                return cal_id

        # Calendar not found
        return None

    except Exception as e:
        return None


# ============================================================================
# OAuth Endpoints
# ============================================================================

@calendar_bp.route('/api/oauth/authorize', methods=['GET'])
def oauth_authorize():
    """
    Start OAuth 2.0 authorization flow.
    Redirects user to Google's consent screen.
    """
    try:
        authorization_url = calendar_service.get_authorization_url()
        return redirect(authorization_url)
    except FileNotFoundError as e:
        return jsonify({
            'error': str(e),
            'instructions': 'Please follow GOOGLE_CALENDAR_SETUP.md to configure OAuth credentials'
        }), 400
    except Exception as e:
        return jsonify({'error': f'Authorization failed: {str(e)}'}), 500


@calendar_bp.route('/api/oauth/callback', methods=['GET'])
def oauth_callback():
    """
    Handle OAuth 2.0 callback from Google.
    Exchanges authorization code for access token.
    """
    try:
        # Get the full callback URL with authorization code
        authorization_response = request.url

        # Exchange code for token
        success = calendar_service.handle_oauth_callback(authorization_response)

        if success:
            return jsonify({
                'success': True,
                'message': 'Successfully authenticated with Google Calendar!',
                'authenticated': True
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to authenticate with Google Calendar'
            }), 400

    except Exception as e:
        return jsonify({'error': f'OAuth callback failed: {str(e)}'}), 500


@calendar_bp.route('/api/oauth/status', methods=['GET'])
def oauth_status():
    """
    Check OAuth authentication status.
    Returns whether user is authenticated with Google Calendar.
    """
    try:
        is_authenticated = calendar_service.is_authenticated()
        return jsonify({
            'authenticated': is_authenticated,
            'message': 'Authenticated with Google Calendar' if is_authenticated else 'Not authenticated'
        })
    except Exception as e:
        return jsonify({'error': f'Status check failed: {str(e)}'}), 500


# ============================================================================
# Calendar Event Operations
# ============================================================================

@calendar_bp.route('/api/calendar/create-event', methods=['POST'])
def create_calendar_event():
    """
    Create a new event in Google Calendar.

    Expects JSON body with event data in Google Calendar API format.
    Returns the created event data from Google Calendar.
    """
    try:
        # Check authentication status
        if not calendar_service.is_authenticated():
            return jsonify({
                'error': 'Not authenticated with Google Calendar',
                'authenticated': False,
                'authorization_url': '/api/oauth/authorize'
            }), 401

        # Get event data from request
        event_data = request.get_json()

        if not event_data:
            return jsonify({'error': 'No event data provided'}), 400

        # Validate required fields
        if 'summary' not in event_data:
            return jsonify({'error': 'Event summary (title) is required'}), 400

        if 'start' not in event_data or 'end' not in event_data:
            return jsonify({'error': 'Event start and end times are required'}), 400

        # Extract calendar assignment if present (not part of Google API format)
        calendar_name = event_data.pop('calendar', None)

        # Resolve calendar name to calendar ID
        calendar_id = None
        if calendar_name:
            calendar_id = resolve_calendar_name_to_id(calendar_name, calendar_service)

        # Format attendees if provided (convert list of strings to list of dicts)
        if 'attendees' in event_data and event_data['attendees']:
            attendees_list = event_data['attendees']
            if isinstance(attendees_list, list) and len(attendees_list) > 0:
                # Convert strings to email dict format if needed
                if isinstance(attendees_list[0], str):
                    event_data['attendees'] = [{'email': email} for email in attendees_list]

        # Create event in Google Calendar with optional calendar_id
        created_event = calendar_service.create_event(event_data, calendar_id=calendar_id)

        if created_event:
            return jsonify({
                'success': True,
                'message': 'Event created successfully',
                'event': {
                    'id': created_event.get('id'),
                    'summary': created_event.get('summary'),
                    'start': created_event.get('start'),
                    'end': created_event.get('end'),
                    'htmlLink': created_event.get('htmlLink'),
                    'location': created_event.get('location'),
                    'description': created_event.get('description'),
                    'calendar': calendar_name or 'Primary'
                }
            })
        else:
            return jsonify({'error': 'Failed to create event'}), 500

    except Exception as e:
        return jsonify({'error': f'Event creation failed: {str(e)}'}), 500


@calendar_bp.route('/api/calendar/check-conflicts', methods=['POST'])
def check_calendar_conflicts():
    """
    Check for scheduling conflicts using Google Calendar's Freebusy API.

    Expects JSON body with start and end times.
    Returns list of conflicting busy periods.
    """
    try:
        # Check authentication status
        if not calendar_service.is_authenticated():
            return jsonify({
                'error': 'Not authenticated with Google Calendar',
                'authenticated': False,
                'authorization_url': '/api/oauth/authorize'
            }), 401

        # Get time range from request
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No data provided'}), 400

        start_time = data.get('start')
        end_time = data.get('end')

        if not start_time or not end_time:
            return jsonify({'error': 'Start and end times are required'}), 400

        # Check for conflicts
        busy_periods = calendar_service.check_conflicts(start_time, end_time)

        has_conflicts = len(busy_periods) > 0

        return jsonify({
            'has_conflicts': has_conflicts,
            'conflicts': busy_periods,
            'message': f'Found {len(busy_periods)} conflict(s)' if has_conflicts else 'No conflicts found'
        })

    except Exception as e:
        return jsonify({'error': f'Conflict check failed: {str(e)}'}), 500


@calendar_bp.route('/api/calendar/list-events', methods=['GET'])
def list_calendar_events():
    """
    List upcoming events from Google Calendar.

    Query parameters:
    - max_results: Maximum number of events to return (default: 10)
    - time_min: Start time in ISO format (default: current time)
    """
    try:
        # Check authentication status
        if not calendar_service.is_authenticated():
            return jsonify({
                'error': 'Not authenticated with Google Calendar',
                'authenticated': False,
                'authorization_url': '/api/oauth/authorize'
            }), 401

        # Get query parameters
        max_results = request.args.get('max_results', 10, type=int)
        time_min = request.args.get('time_min', None)

        # List events
        events = calendar_service.list_events(max_results=max_results, time_min=time_min)

        return jsonify({
            'success': True,
            'count': len(events),
            'events': events
        })

    except Exception as e:
        return jsonify({'error': f'Failed to list events: {str(e)}'}), 500


@calendar_bp.route('/api/calendar/list-calendars', methods=['GET'])
def list_calendars():
    """
    List all calendars the user has access to with their colors.

    Returns list of calendars with id, summary (name), backgroundColor, etc.
    """
    try:
        # Check authentication status
        if not calendar_service.is_authenticated():
            return jsonify({
                'error': 'Not authenticated with Google Calendar',
                'authenticated': False,
                'authorization_url': '/api/oauth/authorize'
            }), 401

        # Get calendar list
        calendars = calendar_service.get_calendar_list()

        return jsonify({
            'success': True,
            'count': len(calendars),
            'calendars': calendars
        })

    except Exception as e:
        return jsonify({'error': f'Failed to list calendars: {str(e)}'}), 500


# ============================================================================
# Session Calendar Integration (Supabase Auth)
# ============================================================================

@calendar_bp.route('/api/sessions/<session_id>/add-to-calendar', methods=['POST'])
@require_auth
def add_session_to_calendar(session_id):
    """
    Create Google Calendar events from a session's processed_events.

    Requires authentication. User must have Google Calendar connected.

    Path parameters:
    - session_id: UUID of the session to add to calendar

    Returns:
        - success: Whether all events were created successfully
        - calendar_event_ids: List of Google Calendar event IDs
        - conflicts: List of detected scheduling conflicts
        - message: Summary message
    """
    try:
        # Get authenticated user
        user_id = request.user_id

        # Check if user has connected calendar provider
        if not factory.is_authenticated(user_id):
            return jsonify({
                'error': 'Calendar not connected',
                'message': 'Please connect your calendar account first',
                'authenticated': False
            }), 401

        # Create events from session (uses primary provider)
        calendar_event_ids, conflicts = factory.create_events_from_session(user_id, session_id)

        # Prepare response
        has_conflicts = len(conflicts) > 0
        message = f"Created {len(calendar_event_ids)} event(s) successfully"

        if has_conflicts:
            message += f", but found {len(conflicts)} scheduling conflict(s)"

        return jsonify({
            'success': True,
            'calendar_event_ids': calendar_event_ids,
            'num_events_created': len(calendar_event_ids),
            'conflicts': conflicts,
            'has_conflicts': has_conflicts,
            'message': message
        })

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except PermissionError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        return jsonify({'error': f'Failed to add events to calendar: {str(e)}'}), 500


@calendar_bp.route('/api/auth/google-calendar/status', methods=['GET'])
@require_auth
def check_google_calendar_status():
    """
    Check if the authenticated user has connected their Google Calendar.

    Requires authentication.

    Returns:
        - connected: Whether user has Google Calendar tokens stored
        - valid: Whether the stored tokens are valid (not expired)
    """
    try:
        user_id = request.user_id

        # Check authentication status (for primary provider)
        is_connected = factory.is_authenticated(user_id)
        is_valid = is_connected

        return jsonify({
            'connected': is_connected,
            'valid': is_valid,
            'message': 'Google Calendar connected' if is_valid else 'Google Calendar not connected or expired'
        })

    except Exception as e:
        return jsonify({'error': f'Failed to check status: {str(e)}'}), 500


@calendar_bp.route('/api/auth/google-calendar/store-tokens', methods=['POST'])
@require_auth
def store_google_calendar_tokens():
    """
    Store Google OAuth tokens from Supabase Auth session.

    This should be called by the frontend after successful Google OAuth sign-in.
    The frontend extracts provider tokens from the Supabase session and sends them here.

    Requires authentication.

    Expects JSON body:
    {
        "provider_token": {
            "access_token": "...",
            "refresh_token": "...",  // optional
            "expires_at": 1234567890  // optional, unix timestamp or ISO string
        }
    }

    Returns:
        - success: Whether tokens were stored successfully
        - message: Success message
    """
    try:
        user_id = request.user_id
        data = request.get_json()

        if not data or 'provider_token' not in data:
            return jsonify({'error': 'No provider_token provided'}), 400

        provider_token = data['provider_token']

        # Store tokens in database
        google_auth.store_google_tokens_from_supabase(user_id, provider_token)

        return jsonify({
            'success': True,
            'message': 'Google Calendar tokens stored successfully',
            'connected': True
        })

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': f'Failed to store tokens: {str(e)}'}), 500
