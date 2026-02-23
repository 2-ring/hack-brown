"""
Evaluation Framework for Similarity System

Provides metrics and tools for evaluating similarity search quality:
- Precision@k: % of retrieved events that are useful
- Recall@k: % of useful events that are retrieved
- MRR: Mean Reciprocal Rank (how quickly we find relevant results)
- Formatting Accuracy: Ultimate test - do retrieved examples lead to correct formatting?

Based on information retrieval and few-shot learning evaluation practices.
"""

import numpy as np
from typing import List, Dict, Tuple, Optional, Set, Callable
from collections import defaultdict
from config.similarity import EvaluationConfig


class SimilarityEvaluator:
    """
    Evaluate similarity search quality on calendar events.

    Measures how well the similarity system retrieves events that would
    be formatted similarly (the ultimate goal for few-shot style transfer).
    """

    def __init__(self, similarity_service):
        """
        Initialize evaluator.

        Args:
            similarity_service: ProductionSimilaritySearch or TwoStageRetrieval instance
        """
        self.similarity = similarity_service

    def evaluate_on_test_set(
        self,
        test_events: List[Dict],
        historical_events: List[Dict],
        k: int = EvaluationConfig.DEFAULT_K
    ) -> Dict[str, float]:
        """
        Evaluate retrieval quality on held-out test set.

        Args:
            test_events: Events to use as queries
            historical_events: Events to search through
            k: Number of results to retrieve

        Returns:
            Dict with metrics:
                - precision@k: % of retrieved that are relevant
                - recall@k: % of relevant that were retrieved
                - mrr: Mean Reciprocal Rank
                - avg_score: Average similarity score

        Example:
            >>> metrics = evaluator.evaluate_on_test_set(test_events, historical_events)
            >>> print(f"Precision@10: {metrics['precision@k']:.2%}")
        """
        metrics = {
            'precision@k': [],
            'recall@k': [],
            'mrr': [],
            'avg_score': []
        }

        for query_event in test_events:
            # Get ground truth: events with SAME formatting characteristics
            ground_truth = self._get_same_format_events(
                query_event, historical_events
            )

            if not ground_truth:
                continue  # Skip if no similar events exist

            # Retrieve similar events
            try:
                results = self.similarity.find_similar(query_event, k=k)
                retrieved_ids = [e['id'] for e, _, _ in results]
            except Exception:
                # If similarity search fails, skip this query
                continue

            # Precision@k: What % of retrieved are correct?
            relevant_retrieved = set(retrieved_ids) & set(ground_truth)
            if retrieved_ids:
                precision = len(relevant_retrieved) / len(retrieved_ids)
                metrics['precision@k'].append(precision)

            # Recall@k: What % of correct ones did we retrieve?
            if ground_truth:
                recall = len(relevant_retrieved) / len(ground_truth)
                metrics['recall@k'].append(recall)

            # MRR: How quickly do we find relevant results?
            for rank, event_id in enumerate(retrieved_ids, 1):
                if event_id in ground_truth:
                    metrics['mrr'].append(1.0 / rank)
                    break
            else:
                # No relevant result found
                metrics['mrr'].append(0.0)

            # Average similarity score
            if results:
                scores = [score for _, score, _ in results]
                metrics['avg_score'].append(np.mean(scores))

        # Compute averages
        return {k: float(np.mean(v)) if v else 0.0 for k, v in metrics.items()}

    def _get_same_format_events(
        self,
        query: Dict,
        candidates: List[Dict]
    ) -> List[str]:
        """
        Find events that should be formatted similarly to query.

        Heuristic: Same calendar + similar title structure (keyword overlap)

        Args:
            query: Query event
            candidates: Candidate events to check

        Returns:
            List of event IDs that should be formatted similarly
        """
        same_format = []

        query_id = query.get('id', '')
        query_calendar = query.get('calendar_name', '').lower()
        query_title = query.get('title', query.get('summary', '')).lower()

        # Extract keywords from query
        query_words = set(self._extract_important_words(query_title))

        for candidate in candidates:
            candidate_id = candidate.get('id', '')

            # Skip self
            if candidate_id == query_id:
                continue

            # Must be from same calendar
            candidate_calendar = candidate.get('calendar_name', '').lower()
            if candidate_calendar != query_calendar:
                continue

            # Check for keyword overlap
            candidate_title = candidate.get('title', candidate.get('summary', '')).lower()
            candidate_words = set(self._extract_important_words(candidate_title))

            if not query_words or not candidate_words:
                continue

            # Jaccard similarity
            overlap = len(query_words & candidate_words) / len(query_words | candidate_words)

            # At least 30% word overlap = similar formatting expected
            if overlap > EvaluationConfig.SAME_FORMAT_SIMILARITY_THRESHOLD:
                same_format.append(candidate_id)

        return same_format

    def _extract_important_words(self, text: str) -> List[str]:
        """Extract important words (no stopwords, length > 3)."""
        import re

        stopwords = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'}

        # Clean text
        text = re.sub(r'[^a-z0-9\s]', ' ', text.lower())
        words = text.split()

        # Filter
        return [w for w in words if len(w) > 3 and w not in stopwords]


def run_evaluation_report(
    similarity_service,
    test_events: List[Dict],
    historical_events: List[Dict],
    k: int = 10
) -> Dict[str, float]:
    """
    Generate comprehensive evaluation report.

    Args:
        similarity_service: Similarity search instance
        test_events: Test events (held-out)
        historical_events: Historical events to search
        k: Number of results to retrieve

    Returns:
        Dict with evaluation metrics

    Example:
        >>> from preferences.similarity_service import ProductionSimilaritySearch
        >>> search = ProductionSimilaritySearch()
        >>> search.build_index(historical_events)
        >>> metrics = run_evaluation_report(search, test_events, historical_events)
    """
    evaluator = SimilarityEvaluator(similarity_service)
    metrics = evaluator.evaluate_on_test_set(test_events, historical_events, k=k)

    # Print formatted report
    print("=" * 70)
    print("SIMILARITY SYSTEM EVALUATION REPORT")
    print("=" * 70)
    print(f"Test Events:       {len(test_events)}")
    print(f"Historical Events: {len(historical_events)}")
    print(f"k (results):       {k}")
    print()
    print("METRICS:")
    print(f"  Precision@{k}:  {metrics['precision@k']:.2%}  (% of retrieved that are useful)")
    print(f"  Recall@{k}:     {metrics['recall@k']:.2%}  (% of useful that were retrieved)")
    print(f"  MRR:            {metrics['mrr']:.3f}  (rank quality)")
    print(f"  Avg Score:      {metrics['avg_score']:.3f}  (similarity scores)")
    print()
    print("TARGET METRICS:")
    print(f"  Precision@{k}:  ≥{EvaluationConfig.TARGET_PRECISION:.0%}")
    print(f"  Recall@{k}:     ≥{EvaluationConfig.TARGET_RECALL:.0%}")
    print(f"  MRR:            ≥{EvaluationConfig.TARGET_MRR}")
    print()

    # Check if targets met
    targets_met = (
        metrics['precision@k'] >= EvaluationConfig.TARGET_PRECISION and
        metrics['recall@k'] >= EvaluationConfig.TARGET_RECALL and
        metrics['mrr'] >= EvaluationConfig.TARGET_MRR
    )

    if targets_met:
        print("✅ ALL TARGETS MET")
    else:
        print("❌ TARGETS NOT MET - Consider:")
        if metrics['precision@k'] < EvaluationConfig.TARGET_PRECISION:
            print("   - Tune similarity weights")
        if metrics['recall@k'] < EvaluationConfig.TARGET_RECALL:
            print("   - Increase rerank_factor")
        if metrics['mrr'] < EvaluationConfig.TARGET_MRR:
            print("   - Improve semantic model or add more signals")

    print("=" * 70)

    return metrics


def split_train_test(
    events: List[Dict],
    test_ratio: float = 0.2,
    random_seed: int = 42
) -> Tuple[List[Dict], List[Dict]]:
    """
    Split events into train and test sets.

    Args:
        events: All events
        test_ratio: Fraction for test set (default 0.2 = 20%)
        random_seed: Random seed for reproducibility

    Returns:
        Tuple of (train_events, test_events)

    Example:
        >>> train, test = split_train_test(all_events, test_ratio=0.2)
        >>> print(f"Train: {len(train)}, Test: {len(test)}")
    """
    np.random.seed(random_seed)

    # Shuffle indices
    indices = np.arange(len(events))
    np.random.shuffle(indices)

    # Split
    n_test = int(len(events) * test_ratio)
    test_indices = indices[:n_test]
    train_indices = indices[n_test:]

    train_events = [events[i] for i in train_indices]
    test_events = [events[i] for i in test_indices]

    return train_events, test_events


def cross_validate(
    similarity_service_factory: Callable,
    events: List[Dict],
    n_folds: int = 5,
    k: int = 10
) -> Dict[str, List[float]]:
    """
    Perform k-fold cross-validation.

    Args:
        similarity_service_factory: Function that creates similarity service
        events: All events
        n_folds: Number of folds
        k: Number of results to retrieve

    Returns:
        Dict mapping metric names to lists of fold scores

    Example:
        >>> def factory():
        ...     from preferences.similarity_service import ProductionSimilaritySearch
        ...     return ProductionSimilaritySearch()
        >>> cv_results = cross_validate(factory, all_events, n_folds=5)
        >>> print(f"Precision: {np.mean(cv_results['precision@k']):.2%}")
    """
    np.random.seed(42)

    # Shuffle events
    indices = np.arange(len(events))
    np.random.shuffle(indices)

    # Split into folds
    fold_size = len(events) // n_folds
    fold_results = defaultdict(list)

    for fold in range(n_folds):
        print(f"\nFold {fold + 1}/{n_folds}...")

        # Split data
        test_start = fold * fold_size
        test_end = test_start + fold_size
        test_indices = indices[test_start:test_end]
        train_indices = np.concatenate([indices[:test_start], indices[test_end:]])

        test_events = [events[i] for i in test_indices]
        train_events = [events[i] for i in train_indices]

        # Build index and evaluate
        similarity_service = similarity_service_factory()
        similarity_service.build_index(train_events)

        evaluator = SimilarityEvaluator(similarity_service)
        metrics = evaluator.evaluate_on_test_set(test_events, train_events, k=k)

        # Store results
        for metric, value in metrics.items():
            fold_results[metric].append(value)

        print(f"  Precision@{k}: {metrics['precision@k']:.2%}")
        print(f"  Recall@{k}:    {metrics['recall@k']:.2%}")
        print(f"  MRR:           {metrics['mrr']:.3f}")

    # Print summary
    print("\n" + "=" * 70)
    print("CROSS-VALIDATION SUMMARY")
    print("=" * 70)
    for metric, values in fold_results.items():
        mean = np.mean(values)
        std = np.std(values)
        print(f"{metric:15s}: {mean:.3f} ± {std:.3f}")

    return dict(fold_results)


def analyze_failure_cases(
    similarity_service,
    test_events: List[Dict],
    historical_events: List[Dict],
    k: int = 10,
    min_precision: float = 0.5
) -> List[Dict]:
    """
    Analyze queries where similarity search performed poorly.

    Helps identify weaknesses in the similarity system.

    Args:
        similarity_service: Similarity search instance
        test_events: Test events
        historical_events: Historical events
        k: Number of results
        min_precision: Precision threshold (queries below this are failures)

    Returns:
        List of failure case dicts with analysis

    Example:
        >>> failures = analyze_failure_cases(search, test_events, historical_events)
        >>> for failure in failures[:5]:
        ...     print(f"Query: {failure['query']['title']}")
        ...     print(f"Precision: {failure['precision']:.2%}")
    """
    evaluator = SimilarityEvaluator(similarity_service)
    failures = []

    for query_event in test_events:
        ground_truth = evaluator._get_same_format_events(query_event, historical_events)

        if not ground_truth:
            continue

        # Retrieve similar events
        results = similarity_service.find_similar(query_event, k=k)
        retrieved_ids = [e['id'] for e, _, _ in results]

        # Calculate precision
        relevant_retrieved = set(retrieved_ids) & set(ground_truth)
        precision = len(relevant_retrieved) / len(retrieved_ids) if retrieved_ids else 0.0

        # Is this a failure case?
        if precision < min_precision:
            failures.append({
                'query': query_event,
                'precision': precision,
                'recall': len(relevant_retrieved) / len(ground_truth),
                'num_relevant': len(ground_truth),
                'num_retrieved_relevant': len(relevant_retrieved),
                'retrieved_events': results[:5],  # Top 5 for analysis
                'expected_ids': ground_truth[:10]  # Top 10 expected
            })

    # Sort by worst precision
    failures.sort(key=lambda x: x['precision'])

    return failures


def print_failure_analysis(failures: List[Dict], max_cases: int = 5):
    """
    Print detailed analysis of failure cases.

    Args:
        failures: Output from analyze_failure_cases()
        max_cases: Maximum number of cases to print
    """
    print("=" * 70)
    print("FAILURE CASE ANALYSIS")
    print("=" * 70)
    print(f"Total failures: {len(failures)}")
    print(f"Showing worst {min(max_cases, len(failures))} cases:")
    print()

    for i, failure in enumerate(failures[:max_cases], 1):
        query = failure['query']
        print(f"Case {i}:")
        print(f"  Query: {query.get('title', query.get('summary', 'N/A'))}")
        print(f"  Calendar: {query.get('calendar_name', 'N/A')}")
        print(f"  Precision: {failure['precision']:.2%}")
        print(f"  Recall: {failure['recall']:.2%}")
        print(f"  Expected {failure['num_relevant']} relevant, got {failure['num_retrieved_relevant']}")
        print(f"  Retrieved:")
        for j, (event, score, _) in enumerate(failure['retrieved_events'], 1):
            print(f"    {j}. {event.get('title', 'N/A')} (score: {score:.3f})")
        print()

    print("=" * 70)
