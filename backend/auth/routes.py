"""
Authentication API Routes
Handles user account creation and sign-in from OAuth providers.
Separate from calendar connections - this is purely for authentication.
"""

from flask import Blueprint, jsonify, request
from typing import Dict, Any

from database.models import User
from auth.middleware import require_auth
from database.supabase_client import get_supabase

# Create blueprint
auth_bp = Blueprint('auth', __name__)


def extract_google_profile_from_metadata(user_metadata: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract profile information from Supabase user metadata (Google OAuth).

    Args:
        user_metadata: Supabase user.user_metadata dict

    Returns:
        Dict with display_name, photo_url, provider_id
    """
    return {
        "display_name": user_metadata.get('name') or user_metadata.get('full_name'),
        "photo_url": user_metadata.get('avatar_url') or user_metadata.get('picture'),
        "provider_id": user_metadata.get('provider_id') or user_metadata.get('sub')
    }


# ============================================================================
# Authentication Endpoints
# ============================================================================

@auth_bp.route('/api/auth/sync-profile', methods=['POST'])
@require_auth
def sync_user_profile():
    """
    Sync user profile from Supabase Auth to custom users table.
    Creates user account if first time, updates auth_providers if returning user.

    This should be called by the frontend immediately after successful OAuth sign-in.

    Requires authentication (JWT token in Authorization header).

    Returns:
        - user: User profile data
        - is_new_user: Whether this was a new account creation
        - provider: Which auth provider was used
    """
    try:
        # Get authenticated user ID from middleware
        user_id = request.user_id

        # Get full user data from Supabase Auth
        supabase = get_supabase()
        auth_response = supabase.auth.admin.get_user(user_id)

        if not auth_response or not auth_response.user:
            return jsonify({'error': 'Failed to get user data from Supabase'}), 500

        auth_user = auth_response.user
        user_metadata = auth_user.user_metadata or {}

        # Determine which provider they used
        # For now, we only support Google, but this is extensible
        provider = 'google'  # Can be extended to check auth_user.app_metadata.provider

        # Extract profile info from metadata
        profile = extract_google_profile_from_metadata(user_metadata)

        # Check if user exists
        existing_user = User.get_by_id(user_id)
        is_new_user = existing_user is None

        if is_new_user:
            # Create new user
            supabase = get_supabase()
            user_data = {
                "id": user_id,
                "email": auth_user.email,
                "display_name": profile['display_name'],
                "photo_url": profile['photo_url'],
                "primary_auth_provider": provider,
                "provider_connections": [{
                    "provider": provider,
                    "provider_id": profile['provider_id'],
                    "email": auth_user.email,
                    "display_name": profile['display_name'],
                    "photo_url": profile['photo_url'],
                    "usage": ["auth"],
                    "linked_at": supabase.table("users").select("created_at").execute().data[0]['created_at'] if False else "now"
                }]
            }
            response = supabase.table("users").insert(user_data).execute()
            user = response.data[0]
        else:
            # Add provider connection if not already present
            User.add_provider_connection(
                user_id=user_id,
                provider=provider,
                provider_id=profile['provider_id'],
                email=auth_user.email,
                usage=["auth"],
                display_name=profile['display_name'],
                photo_url=profile['photo_url']
            )
            user = User.get_by_id(user_id)

        return jsonify({
            'success': True,
            'user': {
                'id': user['id'],
                'email': user['email'],
                'display_name': user['display_name'],
                'photo_url': user['photo_url'],
                'provider_connections': user.get('provider_connections', []),
                'primary_auth_provider': user.get('primary_auth_provider'),
                'primary_calendar_provider': user.get('primary_calendar_provider')
            },
            'is_new_user': is_new_user,
            'provider': provider,
            'message': 'Account created successfully' if is_new_user else 'Welcome back'
        })

    except Exception as e:
        return jsonify({'error': f'Profile sync failed: {str(e)}'}), 500


@auth_bp.route('/api/auth/profile', methods=['GET'])
@require_auth
def get_user_profile():
    """
    Get the authenticated user's profile.

    Requires authentication.

    Returns:
        - user: User profile data including auth_providers and calendar_connections
    """
    try:
        user_id = request.user_id

        user = User.get_by_id(user_id)

        if not user:
            return jsonify({
                'error': 'User not found',
                'message': 'Please complete sign-in to create your account'
            }), 404

        return jsonify({
            'success': True,
            'user': {
                'id': user['id'],
                'email': user['email'],
                'display_name': user['display_name'],
                'photo_url': user['photo_url'],
                'provider_connections': user.get('provider_connections', []),
                'primary_auth_provider': user.get('primary_auth_provider'),
                'primary_calendar_provider': user.get('primary_calendar_provider'),
                'preferences': user.get('preferences', {}),
                'created_at': user.get('created_at'),
                'updated_at': user.get('updated_at')
            }
        })

    except Exception as e:
        return jsonify({'error': f'Failed to get profile: {str(e)}'}), 500


@auth_bp.route('/api/auth/profile', methods=['PUT'])
@require_auth
def update_user_profile():
    """
    Update the authenticated user's profile (display_name, photo_url, etc.).

    Requires authentication.

    Expects JSON body:
    {
        "display_name": "New Name",
        "photo_url": "https://..."
    }

    Returns:
        - user: Updated user profile data
    """
    try:
        user_id = request.user_id
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # Only allow updating certain fields
        allowed_fields = ['display_name', 'photo_url']
        update_data = {k: v for k, v in data.items() if k in allowed_fields}

        if not update_data:
            return jsonify({'error': 'No valid fields to update'}), 400

        # Update user
        supabase = get_supabase()
        response = supabase.table("users").update(update_data).eq("id", user_id).execute()

        if not response.data:
            return jsonify({'error': 'User not found'}), 404

        updated_user = response.data[0]

        return jsonify({
            'success': True,
            'user': {
                'id': updated_user['id'],
                'email': updated_user['email'],
                'display_name': updated_user['display_name'],
                'photo_url': updated_user['photo_url']
            },
            'message': 'Profile updated successfully'
        })

    except Exception as e:
        return jsonify({'error': f'Failed to update profile: {str(e)}'}), 500


# ============================================================================
# Provider Management Endpoints
# ============================================================================

@auth_bp.route('/api/auth/providers', methods=['GET'])
@require_auth
def list_auth_providers():
    """
    List all authentication providers linked to this account.

    Requires authentication.

    Returns:
        - providers: Array of auth providers
    """
    try:
        user_id = request.user_id
        user = User.get_by_id(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        return jsonify({
            'success': True,
            'providers': user.get('auth_providers', [])
        })

    except Exception as e:
        return jsonify({'error': f'Failed to list providers: {str(e)}'}), 500
