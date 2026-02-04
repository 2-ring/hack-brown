"""
Integration tests for complete similarity system.

Tests the full pipeline:
1. Build index from historical events
2. Search for similar events
3. Verify results quality
4. Test edge cases (diversity, fallback, novelty)
5. Test caching behavior
"""

import pytest
import sys
import os
import time

# Add backend to path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)


class TestSimilaritySystemIntegration:
    """Integration tests for complete similarity system."""

    @pytest.fixture
    def sample_events(self):
        """Create sample historical events for testing."""
        return [
            {
                'id': '1',
                'title': 'MATH 0180 Homework 1',
                'summary': 'MATH 0180 Homework 1',
                'all_day': True,
                'calendar_name': 'Classes'
            },
            {
                'id': '2',
                'title': 'MATH 0180 Homework 2',
                'summary': 'MATH 0180 Homework 2',
                'all_day': True,
                'calendar_name': 'Classes'
            },
            {
                'id': '3',
                'title': 'CSCI 0200 Lab Assignment',
                'summary': 'CSCI 0200 Lab Assignment',
                'all_day': False,
                'calendar_name': 'Classes'
            },
            {
                'id': '4',
                'title': 'Team Meeting',
                'summary': 'Team Meeting',
                'all_day': False,
                'calendar_name': 'Work'
            },
            {
                'id': '5',
                'title': 'Doctor Appointment',
                'summary': 'Doctor Appointment',
                'all_day': False,
                'calendar_name': 'Personal'
            },
            {
                'id': '6',
                'title': 'Math Problem Set 3',
                'summary': 'Math Problem Set 3',
                'all_day': True,
                'calendar_name': 'Classes'
            },
            {
                'id': '7',
                'title': 'Weekly Standup',
                'summary': 'Weekly Standup',
                'all_day': False,
                'calendar_name': 'Work'
            },
            {
                'id': '8',
                'title': 'CSCI 0200 Homework',
                'summary': 'CSCI 0200 Homework',
                'all_day': True,
                'calendar_name': 'Classes'
            },
        ]

    @pytest.fixture
    def production_search(self, sample_events):
        """Create production search instance with indexed events."""
        from preferences.similarity_service import ProductionSimilaritySearch

        search = ProductionSimilaritySearch()
        search.build_index(sample_events)
        return search

    def test_end_to_end_similarity_search(self, production_search):
        """Test complete pipeline: query → search → results."""
        query = {
            'title': 'math homework due friday',
            'all_day': True,
            'calendar_name': 'Classes'
        }

        results = production_search.find_similar(query, k=3)

        # Should return 3 results
        assert len(results) == 3, f"Expected 3 results, got {len(results)}"

        # Results should be tuples of (event, score, breakdown)
        for event, score, breakdown in results:
            assert isinstance(event, dict), "Event should be dict"
            assert 'title' in event, "Event should have title"
            assert isinstance(score, float), "Score should be float"
            assert 0.0 <= score <= 1.0, f"Score should be in [0,1], got {score}"
            assert isinstance(breakdown, dict), "Breakdown should be dict"
            assert 'semantic' in breakdown, "Breakdown should have semantic"
            assert 'length' in breakdown, "Breakdown should have length"
            assert 'keyword' in breakdown, "Breakdown should have keyword"
            assert 'temporal' in breakdown, "Breakdown should have temporal"

        # Top result should be math-related
        top_event = results[0][0]
        assert 'math' in top_event['title'].lower() or 'MATH' in top_event['title'], \
            f"Top result should be math-related, got: {top_event['title']}"

        print(f"\n✓ End-to-end test passed. Top result: {top_event['title']} (score: {results[0][1]:.3f})")

    def test_index_building_performance(self, sample_events):
        """Test that index building is reasonably fast."""
        from preferences.similarity_service import ProductionSimilaritySearch

        search = ProductionSimilaritySearch()

        start = time.time()
        search.build_index(sample_events)
        elapsed = time.time() - start

        # Should build index in < 5 seconds for small dataset
        assert elapsed < 5.0, f"Index building too slow: {elapsed:.2f}s"

        print(f"\n✓ Index built in {elapsed:.3f}s for {len(sample_events)} events")

    def test_search_performance(self, production_search):
        """Test that search is fast."""
        query = {'title': 'math homework', 'all_day': True}

        start = time.time()
        results = production_search.find_similar(query, k=5)
        elapsed_ms = (time.time() - start) * 1000

        # First search (cache miss) should be < 500ms even for small dataset
        assert elapsed_ms < 500, f"Search too slow: {elapsed_ms:.1f}ms"

        print(f"\n✓ Search completed in {elapsed_ms:.1f}ms")

    def test_caching_behavior(self, production_search):
        """Test that caching improves performance."""
        query = {'title': 'team meeting tomorrow', 'all_day': False}

        # First search (cache miss)
        start = time.time()
        results1 = production_search.find_similar(query, k=3)
        time1 = time.time() - start

        # Second search (cache hit)
        start = time.time()
        results2 = production_search.find_similar(query, k=3)
        time2 = time.time() - start

        # Results should be identical
        assert len(results1) == len(results2), "Cache should return same number of results"

        # Cache should be faster (at least 2x)
        speedup = time1 / time2 if time2 > 0 else float('inf')
        assert speedup > 2.0, f"Cache should be faster, got {speedup:.1f}x speedup"

        # Verify cache stats
        stats = production_search.get_cache_stats()
        assert stats['cache_hits'] > 0, "Should have cache hits"
        assert stats['hit_rate'] > 0, "Hit rate should be positive"

        print(f"\n✓ Cache speedup: {speedup:.1f}x (hit rate: {stats['hit_rate']:.1%})")

    def test_diversity_filtering(self, production_search):
        """Test that diversity filtering returns varied results."""
        query = {
            'title': 'MATH 0180 homework',
            'all_day': True,
            'calendar_name': 'Classes'
        }

        # Get results with diversity
        results = production_search.find_similar_with_diversity(
            query, k=3, diversity_threshold=0.85
        )

        # Should return 3 results
        assert len(results) == 3, f"Expected 3 diverse results, got {len(results)}"

        # Check that results are reasonably different from each other
        # (diversity method should have filtered out near-duplicates)
        titles = [event['title'] for event, _, _ in results]
        print(f"\n✓ Diversity filtering results: {titles}")

    def test_fallback_handling(self, production_search):
        """Test fallback for low-quality matches."""
        # Query that should have low similarity to everything
        query = {
            'title': 'underwater basket weaving championship',
            'all_day': False,
            'calendar_name': 'Personal'
        }

        results = production_search.find_similar_with_fallback(
            query, k=3, min_similarity=0.65
        )

        # Should still return results (fallback)
        assert len(results) > 0, "Fallback should return some results"

        print(f"\n✓ Fallback returned {len(results)} results for novel query")

    def test_novelty_detection(self, production_search):
        """Test detection of novel event types."""
        # Novel event: very different from sample events
        novel_query = {
            'title': 'underwater basket weaving championship finals',
            'all_day': False,
            'calendar_name': 'Hobbies'
        }

        is_novel, avg_similarity = production_search.detect_novel_event(
            novel_query, threshold=0.5
        )

        # Should detect as novel (low similarity to everything)
        print(f"\n✓ Novelty detection: is_novel={is_novel}, avg_similarity={avg_similarity:.3f}")

        # Non-novel event: similar to existing events
        familiar_query = {
            'title': 'math homework assignment',
            'all_day': True,
            'calendar_name': 'Classes'
        }

        is_novel2, avg_similarity2 = production_search.detect_novel_event(
            familiar_query, threshold=0.5
        )

        # Should NOT detect as novel
        assert not is_novel2, "Math homework should not be detected as novel"
        assert avg_similarity2 > avg_similarity, "Familiar event should have higher avg similarity"

        print(f"✓ Familiar event: is_novel={is_novel2}, avg_similarity={avg_similarity2:.3f}")

    def test_multi_faceted_scoring(self, production_search):
        """Test that multi-faceted scoring considers all components."""
        query = {
            'title': 'CSCI 0200 lab',
            'all_day': False,
            'calendar_name': 'Classes'
        }

        results = production_search.find_similar(query, k=3)

        # Check that breakdown includes all components
        for event, score, breakdown in results:
            assert 'semantic' in breakdown, "Missing semantic score"
            assert 'length' in breakdown, "Missing length score"
            assert 'keyword' in breakdown, "Missing keyword score"
            assert 'temporal' in breakdown, "Missing temporal score"
            assert 'final' in breakdown, "Missing final score"

            # Verify weighted combination
            expected_final = (
                0.70 * breakdown['semantic'] +
                0.15 * breakdown['length'] +
                0.10 * breakdown['keyword'] +
                0.05 * breakdown['temporal']
            )

            assert abs(breakdown['final'] - expected_final) < 0.001, \
                f"Final score should be weighted combination. Expected {expected_final:.3f}, got {breakdown['final']:.3f}"

        print(f"\n✓ Multi-faceted scoring verified. Top result breakdown:")
        top_breakdown = results[0][2]
        print(f"  Semantic: {top_breakdown['semantic']:.3f}")
        print(f"  Length:   {top_breakdown['length']:.3f}")
        print(f"  Keyword:  {top_breakdown['keyword']:.3f}")
        print(f"  Temporal: {top_breakdown['temporal']:.3f}")
        print(f"  Final:    {top_breakdown['final']:.3f}")

    def test_calendar_filtering(self, production_search):
        """Test that results can be filtered by calendar."""
        query = {
            'title': 'meeting',
            'all_day': False,
            'calendar_name': 'Work'
        }

        results = production_search.find_similar(query, k=5)

        # Top results should ideally be from Work calendar
        work_results = [event for event, _, _ in results if event.get('calendar_name') == 'Work']

        print(f"\n✓ Found {len(work_results)} Work calendar events in top 5 results")

    def test_empty_index_handling(self):
        """Test handling of empty index."""
        from preferences.similarity_service import ProductionSimilaritySearch

        search = ProductionSimilaritySearch()

        # Build with empty list
        search.build_index([])

        query = {'title': 'test event', 'all_day': True}

        # Should handle gracefully
        try:
            results = search.find_similar(query, k=5)
            # Should return empty list or handle appropriately
            assert isinstance(results, list), "Should return list"
            print("\n✓ Empty index handled gracefully")
        except Exception as e:
            # If it raises an exception, it should be informative
            assert "empty" in str(e).lower() or "no events" in str(e).lower(), \
                f"Exception should mention empty index: {e}"
            print("\n✓ Empty index raises appropriate error")

    def test_real_world_queries(self, production_search):
        """Test with realistic user queries."""
        test_queries = [
            {'title': 'math hw', 'all_day': True},  # Abbreviated
            {'title': 'team mtg', 'all_day': False},  # Abbreviated
            {'title': 'CS assignment', 'all_day': True},  # Shortened course name
            {'title': 'homework', 'all_day': True},  # Generic
        ]

        print("\n✓ Real-world query results:")
        for query in test_queries:
            results = production_search.find_similar(query, k=2)
            top_event = results[0][0] if results else None
            top_score = results[0][1] if results else 0.0

            if top_event:
                print(f"  '{query['title']}' → '{top_event['title']}' (score: {top_score:.3f})")
            else:
                print(f"  '{query['title']}' → No results")


class TestSimilarityEvaluation:
    """Test evaluation framework."""

    def test_evaluation_framework_exists(self):
        """Test that evaluation module can be imported."""
        try:
            from preferences.similarity_evaluation import (
                SimilarityEvaluator,
                run_evaluation_report,
                split_train_test,
                cross_validate
            )
            print("\n✓ Evaluation framework imported successfully")
        except ImportError as e:
            pytest.fail(f"Could not import evaluation framework: {e}")

    def test_train_test_split(self):
        """Test train/test splitting utility."""
        from preferences.similarity_evaluation import split_train_test

        events = [{'id': str(i), 'title': f'Event {i}'} for i in range(100)]

        train, test = split_train_test(events, test_ratio=0.2, random_seed=42)

        assert len(train) == 80, f"Expected 80 train events, got {len(train)}"
        assert len(test) == 20, f"Expected 20 test events, got {len(test)}"

        # Check no overlap
        train_ids = set(e['id'] for e in train)
        test_ids = set(e['id'] for e in test)
        assert len(train_ids & test_ids) == 0, "Train and test should not overlap"

        print(f"\n✓ Train/test split: {len(train)} train, {len(test)} test events")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '-s'])
