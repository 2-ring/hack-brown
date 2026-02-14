"""
Plan enforcement utilities.
Provides helpers to check a user's plan and enforce limits.
"""

from functools import wraps
from flask import request, jsonify
from database.models import User
from config.plans import PlanLimits, get_plan_limits


def get_user_plan(user_id: str) -> str:
    """Get user's current plan. Returns 'free' if not found."""
    user = User.get_by_id(user_id)
    if not user:
        return 'free'
    return user.get('plan', 'free')


def get_user_limits(user_id: str) -> PlanLimits:
    """Get PlanLimits for a user based on their plan."""
    return get_plan_limits(get_user_plan(user_id))


def require_feature(feature_name: str):
    """
    Decorator to check if user's plan allows a specific feature.
    Must be used AFTER @require_auth.

    Usage:
        @app.route(...)
        @require_auth
        @require_feature('audio_input_enabled')
        def endpoint(): ...
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            limits = get_user_limits(request.user_id)
            if not getattr(limits, feature_name, False):
                return jsonify({
                    'error': 'You\'ve hit a limit on your current plan. Upgrade to Pro to keep creating!',
                    'error_type': 'plan_limit',
                    'upgrade_url': '/plans'
                }), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator
