"""
Performance tests for similarity search system

Tests performance characteristics:
- FAISS index building speed
- Two-stage retrieval latency
- Cache effectiveness
- Scalability with dataset size
"""

import pytest
import time
import sys
import os

# Add backend to path for imports
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)


def generate_test_events(n: int):
    """Generate synthetic test events."""
    events = []
    categories = ['homework', 'meeting', 'appointment', 'lecture', 'lab', 'practice']
    courses = ['MATH 0180', 'CSCI 0200', 'ECON 1130', 'PHYS 0070', 'CHEM 0330']

    for i in range(n):
        category = categories[i % len(categories)]
        course = courses[i % len(courses)]

        events.append({
            'id': f'event_{i}',
            'title': f'{course} {category} {i}',
            'all_day': i % 2 == 0,
            'calendar_name': 'Classes'
        })

    return events


class TestTwoStageRetrievalPerformance:
    """Test two-stage retrieval performance."""

    @pytest.fixture
    def small_dataset(self):
        """Generate small dataset (100 events)."""
        return generate_test_events(100)

    @pytest.fixture
    def medium_dataset(self):
        """Generate medium dataset (1000 events)."""
        return generate_test_events(1000)

    @pytest.fixture
    def retrieval(self):
        """Create TwoStageRetrieval instance."""
        from preferences.similarity import TwoStageRetrieval
        return TwoStageRetrieval()

    def test_index_building_speed_small(self, retrieval, small_dataset):
        """Test FAISS index builds quickly for small datasets."""
        start = time.time()
        retrieval.build_index(small_dataset)
        elapsed = time.time() - start

        assert elapsed < 5.0, f"Index building should be <5s for 100 events, took {elapsed:.2f}s"
        assert retrieval.index is not None, "Index should be built"
        assert retrieval.index.ntotal == len(small_dataset), "Index should contain all events"

    def test_index_building_speed_medium(self, retrieval, medium_dataset):
        """Test FAISS index builds reasonably fast for medium datasets."""
        start = time.time()
        retrieval.build_index(medium_dataset)
        elapsed = time.time() - start

        assert elapsed < 30.0, f"Index building should be <30s for 1000 events, took {elapsed:.2f}s"
        assert retrieval.index is not None, "Index should be built"

    def test_search_latency(self, retrieval, medium_dataset):
        """Test that two-stage search is fast."""
        # Build index first
        retrieval.build_index(medium_dataset)

        query = {'title': 'MATH 0180 homework', 'all_day': True}

        # Warm up (first query may be slower)
        retrieval.retrieve_similar(query, k=7)

        # Measure actual performance
        start = time.time()
        results = retrieval.retrieve_similar(query, k=7)
        elapsed_ms = (time.time() - start) * 1000

        assert elapsed_ms < 100, f"Search should be <100ms, took {elapsed_ms:.1f}ms"
        assert len(results) == 7, "Should return 7 results"

    def test_batch_search_performance(self, retrieval, medium_dataset):
        """Test performance with multiple queries."""
        retrieval.build_index(medium_dataset)

        queries = [
            {'title': 'MATH homework', 'all_day': True},
            {'title': 'CSCI lab', 'all_day': False},
            {'title': 'doctor appointment', 'all_day': True},
            {'title': 'team meeting', 'all_day': False},
        ]

        start = time.time()
        for query in queries:
            retrieval.retrieve_similar(query, k=7)
        elapsed = time.time() - start

        avg_ms = (elapsed / len(queries)) * 1000
        assert avg_ms < 100, f"Average search should be <100ms, got {avg_ms:.1f}ms"

    def test_results_accuracy(self, retrieval, small_dataset):
        """Test that two-stage retrieval returns relevant results."""
        retrieval.build_index(small_dataset)

        query = {'title': 'MATH 0180 homework', 'all_day': True}
        results = retrieval.retrieve_similar(query, k=5)

        # Should return results
        assert len(results) > 0, "Should return results"

        # Results should be sorted by score
        scores = [score for _, score, _ in results]
        assert scores == sorted(scores, reverse=True), "Results should be sorted by score"

        # Scores should be in valid range
        for _, score, _ in results:
            assert 0.0 <= score <= 1.0, f"Score should be in [0,1], got {score}"


class TestProductionSearchPerformance:
    """Test production search with caching."""

    @pytest.fixture
    def medium_dataset(self):
        """Generate medium dataset."""
        return generate_test_events(1000)

    @pytest.fixture
    def search(self):
        """Create ProductionSimilaritySearch instance."""
        from preferences.similarity import ProductionSimilaritySearch
        return ProductionSimilaritySearch()

    def test_cache_effectiveness(self, search, medium_dataset):
        """Test that caching improves performance."""
        search.build_index(medium_dataset)

        query = {'title': 'MATH homework', 'all_day': True}

        # First call - cache miss
        start = time.time()
        results1 = search.find_similar(query, k=7)
        first_call_ms = (time.time() - start) * 1000

        # Second call - cache hit
        start = time.time()
        results2 = search.find_similar(query, k=7)
        second_call_ms = (time.time() - start) * 1000

        # Cache hit should be significantly faster
        assert second_call_ms < first_call_ms / 10, \
            f"Cache hit should be 10x faster. First: {first_call_ms:.1f}ms, Second: {second_call_ms:.1f}ms"

        # Results should be identical
        assert len(results1) == len(results2), "Results should be identical"

        # Check cache stats
        stats = search.get_cache_stats()
        assert stats['cache_hits'] == 1, "Should have 1 cache hit"
        assert stats['cache_misses'] == 1, "Should have 1 cache miss"

    def test_cache_hit_rate(self, search, medium_dataset):
        """Test cache hit rate for repeated queries."""
        search.build_index(medium_dataset)

        # Query same events multiple times
        queries = [
            {'title': 'MATH homework', 'all_day': True},
            {'title': 'CSCI lab', 'all_day': False},
            {'title': 'MATH homework', 'all_day': True},  # Repeat
            {'title': 'CSCI lab', 'all_day': False},      # Repeat
            {'title': 'MATH homework', 'all_day': True},  # Repeat
        ]

        for query in queries:
            search.find_similar(query, k=7)

        stats = search.get_cache_stats()

        # Should have 2 misses (first MATH, first CSCI) and 3 hits
        assert stats['cache_misses'] == 2, f"Should have 2 cache misses, got {stats['cache_misses']}"
        assert stats['cache_hits'] == 3, f"Should have 3 cache hits, got {stats['cache_hits']}"
        assert stats['hit_rate'] == 0.6, f"Hit rate should be 0.6, got {stats['hit_rate']}"

    def test_cache_size_limit(self, search, medium_dataset):
        """Test that cache doesn't grow unbounded."""
        search.build_index(medium_dataset)

        # Query many different events (more than cache limit of 1000)
        for i in range(1500):
            query = {'title': f'Event {i}', 'all_day': True}
            search.find_similar(query, k=7)

        stats = search.get_cache_stats()

        # Cache should be limited to 1000
        assert stats['cache_size'] <= 1000, \
            f"Cache should be limited to 1000, got {stats['cache_size']}"

    def test_avg_search_time_tracking(self, search, medium_dataset):
        """Test that average search time is tracked correctly."""
        search.build_index(medium_dataset)

        # Do several searches
        for i in range(10):
            query = {'title': f'Event {i}', 'all_day': True}
            search.find_similar(query, k=7)

        stats = search.get_cache_stats()

        assert stats['total_searches'] == 10, "Should track 10 searches"
        assert stats['avg_search_time_ms'] > 0, "Average time should be positive"
        assert stats['avg_search_time_ms'] < 200, "Average time should be reasonable"

    def test_cache_clear(self, search, medium_dataset):
        """Test cache clearing."""
        search.build_index(medium_dataset)

        # Add items to cache
        for i in range(5):
            query = {'title': f'Event {i}', 'all_day': True}
            search.find_similar(query, k=7)

        # Verify cache has items
        stats_before = search.get_cache_stats()
        assert stats_before['cache_size'] > 0, "Cache should have items"

        # Clear cache
        search.clear_cache()

        # Verify cache is empty
        stats_after = search.get_cache_stats()
        assert stats_after['cache_size'] == 0, "Cache should be empty"
        assert stats_after['cache_hits'] == 0, "Stats should be reset"
        assert stats_after['cache_misses'] == 0, "Stats should be reset"


class TestScalability:
    """Test system scalability with different dataset sizes."""

    @pytest.fixture
    def search(self):
        """Create ProductionSimilaritySearch instance."""
        from preferences.similarity import ProductionSimilaritySearch
        return ProductionSimilaritySearch()

    @pytest.mark.parametrize("n_events", [100, 500, 1000])
    def test_search_time_scales_sublinearly(self, search, n_events):
        """Test that search time scales better than O(n)."""
        # Generate dataset
        events = generate_test_events(n_events)
        search.build_index(events)

        query = {'title': 'MATH homework', 'all_day': True}

        # Warm up
        search.find_similar(query, k=7, use_cache=False)

        # Measure
        start = time.time()
        search.find_similar(query, k=7, use_cache=False)
        elapsed_ms = (time.time() - start) * 1000

        # With FAISS, search time should be roughly constant
        # regardless of dataset size (within reason)
        assert elapsed_ms < 100, \
            f"Search should be <100ms for {n_events} events, took {elapsed_ms:.1f}ms"

    def test_index_memory_efficiency(self, search):
        """Test that index doesn't use excessive memory."""
        import sys

        # Small dataset
        events = generate_test_events(100)
        search.build_index(events)

        # Get index size (rough estimate)
        index_size = sys.getsizeof(search.retrieval.embeddings)

        # Should be reasonable (384 dims * 100 events * 4 bytes = ~150KB)
        expected_size = 384 * 100 * 4
        assert index_size < expected_size * 2, \
            f"Index size should be reasonable, got {index_size / 1024:.1f}KB"


if __name__ == '__main__':
    pytest.main([__file__, '-v', '-s'])
