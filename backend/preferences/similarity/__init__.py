"""
Similarity module - Semantic similarity for calendar events.

Research-backed multi-faceted similarity system for finding events that
predict formatting preferences.
"""

from .models import (
    SimilarityBreakdown,
    SimilarEvent,
    SimilaritySearchResult,
    SimilarityWeights,
    EventEmbedding
)

from .service import (
    CalendarEventSimilarity,
    TwoStageRetrieval,
    ProductionSimilaritySearch,
    event_to_text
)

from .evaluation import (
    SimilarityEvaluator,
    run_evaluation_report,
    split_train_test,
    cross_validate,
    analyze_failure_cases,
    print_failure_analysis
)

__all__ = [
    # Models
    'SimilarityBreakdown',
    'SimilarEvent',
    'SimilaritySearchResult',
    'SimilarityWeights',
    'EventEmbedding',
    # Service
    'CalendarEventSimilarity',
    'TwoStageRetrieval',
    'ProductionSimilaritySearch',
    'event_to_text',
    # Evaluation
    'SimilarityEvaluator',
    'run_evaluation_report',
    'split_train_test',
    'cross_validate',
    'analyze_failure_cases',
    'print_failure_analysis',
]
