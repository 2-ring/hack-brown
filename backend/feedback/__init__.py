"""
Feedback Loop System

This module implements a feedback loop that learns from user corrections to improve
event formatting and suggestion quality over time.

Components:
- CorrectionAnalyzer: Analyzes differences between system suggestions and user edits
- CorrectionStorageService: Stores corrections with embeddings in the database
- CorrectionQueryService: Queries relevant corrections for different agents

Usage:
    from feedback.correction_service import CorrectionStorageService

    service = CorrectionStorageService()
    service.store_corrections_from_session(user_id, session_id, user_submitted_events)
"""

from .correction_analyzer import CorrectionAnalyzer
from .correction_service import CorrectionStorageService
from .correction_query_service import CorrectionQueryService

__all__ = [
    'CorrectionAnalyzer',
    'CorrectionStorageService',
    'CorrectionQueryService',
]
