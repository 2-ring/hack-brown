"""
Plan-based limits configuration.
Single source of truth for what each plan tier allows.

Both plans start identical — modify independently as needed.
To change limits for a specific plan, edit the dict for that plan below.
"""

from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class PlanLimits:
    """Limits for a single plan tier."""

    # Event processing
    max_events_per_request: int
    max_text_input_length: int

    # File sizes (MB)
    max_image_size_mb: int
    max_audio_size_mb: int
    max_pdf_size_mb: int
    max_text_file_size_mb: int
    max_document_size_mb: int

    # PDF processing
    max_pdf_pages_to_render: int

    # Rate limits
    sessions_per_day: int
    sessions_per_hour: int

    # Feature flags
    audio_input_enabled: bool
    pdf_input_enabled: bool
    document_input_enabled: bool
    conflict_detection_enabled: bool
    personalization_enabled: bool


# ---------------------------------------------------------------------------
# Plan definitions — both start identical, matching current production values
# from config/limits.py and config/processing.py.
# Edit each plan independently below to diverge limits per tier.
# ---------------------------------------------------------------------------

FREE_PLAN = PlanLimits(
    max_events_per_request=25,
    max_text_input_length=50_000,
    max_image_size_mb=20,
    max_audio_size_mb=25,
    max_pdf_size_mb=20,
    max_text_file_size_mb=10,
    max_document_size_mb=10,
    max_pdf_pages_to_render=5,
    sessions_per_day=2000,
    sessions_per_hour=500,
    audio_input_enabled=True,
    pdf_input_enabled=True,
    document_input_enabled=True,
    conflict_detection_enabled=True,
    personalization_enabled=True,
)

PRO_PLAN = PlanLimits(
    max_events_per_request=25,
    max_text_input_length=50_000,
    max_image_size_mb=20,
    max_audio_size_mb=25,
    max_pdf_size_mb=20,
    max_text_file_size_mb=10,
    max_document_size_mb=10,
    max_pdf_pages_to_render=5,
    sessions_per_day=2000,
    sessions_per_hour=500,
    audio_input_enabled=True,
    pdf_input_enabled=True,
    document_input_enabled=True,
    conflict_detection_enabled=True,
    personalization_enabled=True,
)

PLAN_LIMITS: Dict[str, PlanLimits] = {
    "free": FREE_PLAN,
    "pro": PRO_PLAN,
}

# Stripe price configuration
STRIPE_PRICE_CONFIG = {
    "pro": {
        "product_name": "DropCal Pro",
        "unit_amount": 1200,  # $12.00 in cents
        "currency": "usd",
        "interval": "month",
    }
}


def get_plan_limits(plan: str) -> PlanLimits:
    """Get limits for a plan tier. Falls back to free if unknown."""
    return PLAN_LIMITS.get(plan, FREE_PLAN)
