"""
Google Calendar Integration API Routes
Handles OAuth, event creation, conflict checking, and calendar operations.
"""

from flask import Blueprint, jsonify, request, redirect
from typing import Optional

from .service import CalendarService
from calendars import factory
from calendars.google import auth as google_auth  # Still needed for legacy token storage endpoint
from auth.middleware import require_auth
from database.models import User, Calendar

# Create blueprint
calendar_bp = Blueprint('calendar', __name__)

# Initialize calendar service
calendar_service = CalendarService()


def resolve_calendar_to_id(calendar_value: str, calendar_service: CalendarService) -> Optional[str]:
    """
    Resolve a calendar reference to a provider calendar ID.

    Handles both provider calendar IDs (modern flow) and display names (legacy).
    The pipeline now outputs IDs directly, but this handles backward compatibility.

    Args:
        calendar_value: Provider calendar ID or display name (e.g. "Classes", "Default")
        calendar_service: CalendarService instance

    Returns:
        Calendar ID if resolved, None if not found (caller defaults to 'primary')
    """
    try:
        if calendar_value.lower() in ['default', 'primary']:
            return 'primary'

        # Check if value is already a valid calendar ID
        calendars = calendar_service.get_calendar_list()
        for cal in calendars:
            if cal.get('id', '') == calendar_value:
                return calendar_value

        # Fall back to name matching (legacy support)
        for cal in calendars:
            if cal.get('summary', '').lower() == calendar_value.lower():
                return cal.get('id', '')

        return None

    except Exception:
        return None


# ============================================================================
# OAuth Endpoints
# ============================================================================

@calendar_bp.route('/oauth/authorize', methods=['GET'])
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


@calendar_bp.route('/oauth/callback', methods=['GET'])
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


@calendar_bp.route('/oauth/status', methods=['GET'])
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

@calendar_bp.route('/calendar/create-event', methods=['POST'])
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
        calendar_value = event_data.pop('calendar', None)

        # Resolve to provider calendar ID (handles both IDs and display names)
        calendar_id = None
        if calendar_value:
            calendar_id = resolve_calendar_to_id(calendar_value, calendar_service)

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
                    'calendar': calendar_id or 'primary'
                }
            })
        else:
            return jsonify({'error': 'Failed to create event'}), 500

    except Exception as e:
        return jsonify({'error': f'Event creation failed: {str(e)}'}), 500


@calendar_bp.route('/calendar/check-conflicts', methods=['POST'])
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


@calendar_bp.route('/calendar/list-events', methods=['GET'])
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
        from config.calendar import CollectionConfig
        max_results = request.args.get('max_results', CollectionConfig.DEFAULT_CALENDAR_LIST_LIMIT, type=int)
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


@calendar_bp.route('/auth/google-calendar/status', methods=['GET'])
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


@calendar_bp.route('/auth/google-calendar/refresh-tokens', methods=['POST'])
@require_auth
def refresh_google_calendar_tokens():
    """
    Attempt to refresh Google Calendar tokens.
    Called by frontend when a calendar API call returns 401.

    Returns 200 in all cases (failure is an expected state, not a server error):
        - refreshed: Whether tokens were refreshed successfully
        - needs_reauth: Whether user needs to re-authenticate
    """
    try:
        user_id = request.user_id
        credentials = google_auth.load_credentials(user_id)

        if not credentials:
            return jsonify({
                'refreshed': False,
                'needs_reauth': True,
                'error': 'No calendar credentials found'
            })

        if not credentials.refresh_token or credentials.refresh_token == "None":
            return jsonify({
                'refreshed': False,
                'needs_reauth': True,
                'error': 'No valid refresh token'
            })

        success = google_auth.refresh_if_needed(user_id, credentials)

        return jsonify({
            'refreshed': success,
            'needs_reauth': not success
        })

    except Exception as e:
        return jsonify({
            'refreshed': False,
            'needs_reauth': True,
            'error': str(e)
        })


@calendar_bp.route('/auth/google-calendar/store-tokens', methods=['POST'])
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


# ============================================================================
# Calendar Provider Management
# ============================================================================

@calendar_bp.route('/calendar/provider/list', methods=['GET'])
@require_auth
def list_calendar_providers():
    """
    List all connected calendar providers for the authenticated user.

    Returns:
        - providers: Array of provider objects with:
            - provider: Provider name ('google', 'microsoft', 'apple')
            - email: Email associated with provider
            - connected: Whether provider is connected
            - valid: Whether credentials are currently valid
            - is_primary: Whether this is the primary calendar provider
            - usage: Array of usage types (['auth', 'calendar'])
        - primary_provider: Name of primary calendar provider
    """
    try:
        user_id = request.user_id
        user = User.get_by_id(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Get all provider connections
        connections = user.get('provider_connections', [])
        primary_provider = user.get('primary_calendar_provider')

        # Build provider list (include all providers, not just calendar ones)
        provider_list = []
        for conn in connections:
            provider_name = conn.get('provider')
            usage = conn.get('usage', [])
            has_calendar = 'calendar' in usage

            # Check if credentials are valid (only if calendar usage exists)
            valid = False
            if has_calendar:
                try:
                    valid = factory.is_authenticated(user_id, provider_name)
                except Exception:
                    pass

            provider_info = {
                'provider': provider_name,
                'provider_id': conn.get('provider_id'),
                'email': conn.get('email'),
                'connected': has_calendar and valid,
                'valid': valid,
                'is_primary': provider_name == primary_provider,
                'usage': usage,
                'display_name': conn.get('display_name'),
                'linked_at': conn.get('linked_at')
            }

            provider_list.append(provider_info)

        return jsonify({
            'success': True,
            'providers': provider_list,
            'primary_provider': primary_provider
        })

    except Exception as e:
        return jsonify({'error': f'Failed to list calendar providers: {str(e)}'}), 500


@calendar_bp.route('/calendar/provider/set-primary', methods=['POST'])
@require_auth
def set_primary_calendar_provider():
    """
    Set the primary calendar provider for new events.

    Expects JSON body:
    {
        "provider": "google" | "microsoft" | "apple"
    }

    Returns:
        - success: Whether primary provider was set
        - primary_provider: The new primary provider
        - message: Success message
    """
    try:
        user_id = request.user_id
        data = request.get_json()

        if not data or 'provider' not in data:
            return jsonify({'error': 'No provider specified'}), 400

        provider = data['provider']

        # Validate provider is supported
        if provider not in ['google', 'microsoft', 'apple']:
            return jsonify({'error': f'Invalid provider: {provider}'}), 400

        # Check if user has this provider connected
        conn = User.get_provider_connection(user_id, provider)
        if not conn:
            return jsonify({'error': f'Provider {provider} not connected'}), 400

        # Check if 'calendar' is in usage
        if 'calendar' not in conn.get('usage', []):
            return jsonify({'error': f'Provider {provider} not configured for calendar use'}), 400

        # Set as primary
        User.set_primary_calendar(user_id, provider)

        return jsonify({
            'success': True,
            'primary_provider': provider,
            'message': f'{provider.capitalize()} Calendar set as primary'
        })

    except Exception as e:
        return jsonify({'error': f'Failed to set primary provider: {str(e)}'}), 500


@calendar_bp.route('/calendar/provider/disconnect', methods=['POST'])
@require_auth
def disconnect_calendar_provider():
    """
    Disconnect a calendar provider.

    Revokes OAuth token with provider, removes tokens, deletes synced events
    and calendar patterns for that provider.

    Expects JSON body:
    {
        "provider": "google" | "microsoft" | "apple"
    }

    Returns:
        - success: Whether provider was disconnected
        - message: Success message
    """
    try:
        user_id = request.user_id
        data = request.get_json()

        if not data or 'provider' not in data:
            return jsonify({'error': 'No provider specified'}), 400

        provider = data['provider']

        # Get user
        user = User.get_by_id(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Check if provider is connected
        conn = User.get_provider_connection(user_id, provider)
        if not conn:
            return jsonify({'error': f'Provider {provider} not connected'}), 400

        # Revoke OAuth token with the provider
        _revoke_provider_token(user_id, provider)

        # Delete synced events from this provider
        _delete_provider_events(user_id, provider)

        # Delete calendar patterns for this provider
        _delete_provider_calendars(user_id, provider)

        # Remove 'calendar' from usage
        usage = conn.get('usage', [])
        if 'calendar' in usage:
            usage.remove('calendar')

        # If usage is now empty and it's not an auth provider, remove the connection entirely
        if not usage or (len(usage) == 0):
            User.remove_provider_connection(user_id, provider)
        else:
            # Just update usage to remove 'calendar'
            User.update_provider_usage(user_id, provider, usage)

        # If this was the primary provider, clear it
        if user.get('primary_calendar_provider') == provider:
            from database.supabase_client import get_supabase
            supabase = get_supabase()
            supabase.table("users").update({
                "primary_calendar_provider": None
            }).eq("id", user_id).execute()

        return jsonify({
            'success': True,
            'message': f'{provider.capitalize()} Calendar disconnected successfully'
        })

    except Exception as e:
        return jsonify({'error': f'Failed to disconnect provider: {str(e)}'}), 500


def _revoke_provider_token(user_id: str, provider: str) -> None:
    """Revoke OAuth token with the provider's API. Best-effort."""
    try:
        tokens = User.get_provider_tokens(user_id, provider)
        if not tokens:
            return

        access_token = tokens.get('access_token')
        if not access_token:
            return

        if provider == 'google':
            import requests
            requests.post(
                'https://oauth2.googleapis.com/revoke',
                params={'token': access_token},
                headers={'Content-Type': 'application/x-www-form-urlencoded'},
                timeout=5,
            )
        elif provider == 'microsoft':
            # Microsoft Graph does not support programmatic token revocation
            # Tokens will expire naturally; user can revoke at myaccount.microsoft.com
            pass
        elif provider == 'apple':
            # Apple app-specific passwords cannot be revoked programmatically
            # User must revoke at appleid.apple.com
            pass
    except Exception as e:
        print(f"Warning: Failed to revoke {provider} token for user {user_id}: {e}")


def _delete_provider_events(user_id: str, provider: str) -> int:
    """Hard-delete all synced events from a specific provider."""
    try:
        from database.supabase_client import get_supabase
        supabase = get_supabase()
        response = supabase.table("events").delete()\
            .eq("user_id", user_id)\
            .eq("provider", provider).execute()
        return len(response.data)
    except Exception as e:
        print(f"Warning: Failed to delete {provider} events for user {user_id}: {e}")
        return 0


def _delete_provider_calendars(user_id: str, provider: str) -> int:
    """Delete calendar patterns for a specific provider."""
    try:
        from database.supabase_client import get_supabase
        supabase = get_supabase()
        response = supabase.table("calendars").delete()\
            .eq("user_id", user_id)\
            .eq("provider", provider).execute()
        return len(response.data)
    except Exception as e:
        print(f"Warning: Failed to delete {provider} calendars for user {user_id}: {e}")
        return 0


# ============================================================================
# Calendar List Endpoint
# ============================================================================

@calendar_bp.route('/calendar/list', methods=['GET'])
@require_auth
def list_calendars():
    """
    List all calendars for the authenticated user from the database.

    Fast endpoint — reads from the calendars table, no provider API calls.
    Use this to populate calendar selectors (e.g. event edit screen).
    Calendars are synced to the DB during /calendar/sync.

    Returns:
        {
            "success": true,
            "calendars": [
                {
                    "id": "provider_calendar_id",
                    "summary": "Calendar Name",
                    "backgroundColor": "#1170C5",
                    "foregroundColor": "#ffffff",
                    "primary": true,
                    "description": "AI-generated description"
                }
            ]
        }
    """
    try:
        user_id = request.user_id

        db_calendars = Calendar.get_by_user(user_id)
        calendars = [{
            'id': cal['provider_cal_id'],
            'summary': cal['name'],
            'backgroundColor': cal.get('color', '#1170C5'),
            'foregroundColor': cal.get('foreground_color'),
            'primary': cal.get('is_primary', False),
            'description': cal.get('description'),
        } for cal in db_calendars]

        return jsonify({
            'success': True,
            'calendars': calendars,
        })

    except Exception as e:
        return jsonify({'error': f'Failed to list calendars: {str(e)}'}), 500


# ============================================================================
# Smart Sync Endpoint
# ============================================================================

@calendar_bp.route('/calendar/sync', methods=['POST'])
@require_auth
def sync_calendar():
    """
    Smart sync endpoint - backend decides strategy automatically.

    Call this endpoint:
    - When app opens
    - When user navigates to events view
    - When user clicks refresh

    Backend handles:
    - Skip if synced < 2 min ago
    - Incremental sync if has sync token
    - Full sync if first time
    - Fast incremental if recently synced but no token

    Returns:
        {
            'success': true,
            'strategy': 'incremental' | 'full' | 'skip' | 'fast_incremental',
            'synced_at': '2026-02-05T12:34:56Z',
            'is_first_sync': false,
            'last_synced_at': '2026-02-05T12:30:00Z',
            'minutes_since_last_sync': 4,
            'total_events_in_db': 234,
            'events_added': 2,
            'events_updated': 1,
            'events_deleted': 0
        }
    """
    try:
        user_id = request.user_id

        from calendars.sync_service import SmartSyncService
        sync_service = SmartSyncService()

        results = sync_service.sync(user_id)

        return jsonify(results)

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Sync failed: {str(e)}'}), 500


# ============================================================================
# Push Events to Provider
# ============================================================================

@calendar_bp.route('/events/push', methods=['POST'])
@require_auth
def push_events():
    """
    Push event(s) to the user's calendar provider.

    Unified endpoint replacing both single-event sync and batch add-to-calendar.
    Backend decides create vs update vs skip per event based on provider_syncs + version.

    Expects JSON body:
    {
        "event_ids": ["id1", "id2", ...],
        "events": [...],            // Optional: user's edited events (for correction logging)
        "extracted_facts": [...],   // Optional: for correction logging
        "session_id": "..."         // Optional: session context for correction logging
    }

    Returns:
        {
            "success": true,
            "created": ["id1"],
            "updated": ["id2"],
            "skipped": [],
            "num_created": 1,
            "num_updated": 1,
            "num_skipped": 0,
            "message": "Created 1, updated 1"
        }
    """
    try:
        user_id = request.user_id

        if not factory.is_authenticated(user_id):
            return jsonify({
                'error': 'Calendar not connected',
                'authenticated': False
            }), 401

        request_data = request.get_json() or {}
        event_ids = request_data.get('event_ids')

        if not event_ids or not isinstance(event_ids, list):
            return jsonify({'error': 'event_ids array is required'}), 400

        # Log corrections if user provided edited events
        session_id = request_data.get('session_id')
        user_submitted_events = request_data.get('events')
        extracted_facts_list = request_data.get('extracted_facts')

        if user_submitted_events and session_id:
            from feedback.correction_service import CorrectionStorageService
            correction_service = CorrectionStorageService()
            try:
                correction_ids = correction_service.store_corrections_from_session(
                    user_id=user_id,
                    session_id=session_id,
                    user_submitted_events=user_submitted_events,
                    extracted_facts_list=extracted_facts_list
                )
                print(f"Stored {len(correction_ids)} corrections for user {user_id}")
            except Exception as e:
                print(f"Warning: Failed to log corrections: {e}")

        # Push each event
        created = []
        updated = []
        skipped = []

        for eid in event_ids:
            try:
                result = factory.sync_event(user_id, eid)
                action = result['action']
                if action == 'created':
                    created.append(eid)
                elif action == 'updated':
                    updated.append(eid)
                elif action == 'skipped':
                    skipped.append(eid)
            except Exception as e:
                print(f"[push] ERROR event={eid}: {e}")

        # Mark session if provided
        if session_id and created:
            from database.models import Session as DBSession
            try:
                DBSession.mark_added_to_calendar(session_id, created + updated)
            except Exception:
                pass

        # Build message
        parts = []
        if created:
            parts.append(f"Created {len(created)}")
        if updated:
            parts.append(f"updated {len(updated)}")
        if skipped:
            parts.append(f"{len(skipped)} already up to date")
        message = ', '.join(parts) if parts else 'No events to sync'

        return jsonify({
            'success': True,
            'created': created,
            'updated': updated,
            'skipped': skipped,
            'num_created': len(created),
            'num_updated': len(updated),
            'num_skipped': len(skipped),
            # Backward compat
            'calendar_event_ids': created + updated,
            'num_events_created': len(created),
            'conflicts': [],
            'has_conflicts': False,
            'message': message
        })

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except PermissionError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        return jsonify({'error': f'Failed to push events: {str(e)}'}), 500
