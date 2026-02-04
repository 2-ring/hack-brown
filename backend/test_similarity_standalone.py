"""
Standalone test for similarity system that avoids circular import issues.

Tests the similarity system directly without importing through preferences.__init__.py
"""

import sys
import os

# Add backend to path BEFORE any other imports
backend_path = '/home/lucas/files/university/startups/hack@brown/backend'
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

# Import directly from module files to avoid circular imports
import importlib.util

# Load similarity_service module directly
spec = importlib.util.spec_from_file_location(
    "similarity_service",
    os.path.join(backend_path, "preferences/similarity_service.py")
)
similarity_service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(similarity_service)

# Get classes
CalendarEventSimilarity = similarity_service.CalendarEventSimilarity
ProductionSimilaritySearch = similarity_service.ProductionSimilaritySearch


def test_basic_functionality():
    """Test basic similarity system functionality."""
    print("=" * 70)
    print("SIMILARITY SYSTEM STANDALONE TEST")
    print("=" * 70)
    print()

    # Test 1: Initialize similarity engine
    print("1. Initializing CalendarEventSimilarity...")
    try:
        similarity = CalendarEventSimilarity()
        print("   ✓ Initialization successful")
        print(f"   ✓ Model loaded: {similarity.model}")
        print(f"   ✓ Cache size: {similarity.get_cache_size()}")
    except Exception as e:
        print(f"   ✗ FAILED: {e}")
        return False
    print()

    # Test 2: Compute similarity between two events
    print("2. Testing similarity computation...")
    event1 = {'title': 'MATH 0180 Homework', 'all_day': True}
    event2 = {'title': 'Math Problem Set', 'all_day': True}

    try:
        score, breakdown = similarity.compute_similarity(event1, event2)
        print(f"   Event 1: {event1['title']}")
        print(f"   Event 2: {event2['title']}")
        print(f"   ✓ Similarity Score: {score:.3f}")
        print(f"   ✓ Breakdown:")
        print(f"      - Semantic:  {breakdown['semantic']:.3f}")
        print(f"      - Length:    {breakdown['length']:.3f}")
        print(f"      - Keyword:   {breakdown['keyword']:.3f}")
        print(f"      - Temporal:  {breakdown['temporal']:.3f}")

        # Verify score is reasonable
        assert 0.0 <= score <= 1.0, f"Score out of range: {score}"
        assert score > 0.6, f"Similar events should score high, got {score:.3f}"
        print("   ✓ Score in valid range and reasonable")
    except Exception as e:
        print(f"   ✗ FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    print()

    # Test 3: Test with dissimilar events
    print("3. Testing with dissimilar events...")
    event3 = {'title': 'Doctor Appointment', 'all_day': False}

    try:
        score2, breakdown2 = similarity.compute_similarity(event1, event3)
        print(f"   Event 1: {event1['title']}")
        print(f"   Event 3: {event3['title']}")
        print(f"   ✓ Similarity Score: {score2:.3f}")

        # Should be lower than similar events
        assert score2 < score, f"Dissimilar events should score lower, got {score2:.3f} vs {score:.3f}"
        print("   ✓ Dissimilar events scored lower")
    except Exception as e:
        print(f"   ✗ FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    print()

    # Test 4: Production search with index
    print("4. Testing ProductionSimilaritySearch with index...")
    try:
        search = ProductionSimilaritySearch()

        # Sample events
        historical_events = [
            {'id': '1', 'title': 'MATH 0180 Homework 1', 'all_day': True},
            {'id': '2', 'title': 'MATH 0180 Homework 2', 'all_day': True},
            {'id': '3', 'title': 'CSCI 0200 Lab', 'all_day': False},
            {'id': '4', 'title': 'Team Meeting', 'all_day': False},
            {'id': '5', 'title': 'Doctor Appointment', 'all_day': False},
            {'id': '6', 'title': 'Math Problem Set 3', 'all_day': True},
        ]

        print(f"   Building index with {len(historical_events)} events...")
        search.build_index(historical_events)
        print("   ✓ Index built successfully")

        # Search
        query = {'title': 'math homework', 'all_day': True}
        print(f"   Searching for: '{query['title']}'")
        results = search.find_similar(query, k=3)

        print(f"   ✓ Found {len(results)} results:")
        for i, (event, score, breakdown) in enumerate(results, 1):
            print(f"      {i}. {event['title']} (score: {score:.3f})")

        # Top result should be math-related
        top_event = results[0][0]
        assert 'math' in top_event['title'].lower() or 'MATH' in top_event['title'], \
            f"Top result should be math-related, got: {top_event['title']}"
        print("   ✓ Top result is relevant")

    except Exception as e:
        print(f"   ✗ FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    print()

    # Test 5: Caching
    print("5. Testing cache functionality...")
    try:
        # First search (cache miss)
        query2 = {'title': 'team meeting', 'all_day': False}
        results1 = search.find_similar(query2, k=2)
        stats1 = search.get_cache_stats()

        # Second search (cache hit)
        results2 = search.find_similar(query2, k=2)
        stats2 = search.get_cache_stats()

        print(f"   ✓ Cache stats:")
        print(f"      - Cache size: {stats2['cache_size']}")
        print(f"      - Hits: {stats2['cache_hits']}")
        print(f"      - Misses: {stats2['cache_misses']}")
        print(f"      - Hit rate: {stats2['hit_rate']:.1%}")

        assert stats2['cache_hits'] > stats1['cache_hits'], "Second query should hit cache"
        print("   ✓ Cache is working")

    except Exception as e:
        print(f"   ✗ FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    print()

    # Test 6: Edge cases
    print("6. Testing edge case handling...")
    try:
        # Diversity
        diverse_results = search.find_similar_with_diversity(query, k=3)
        print(f"   ✓ Diversity filtering returned {len(diverse_results)} results")

        # Novelty detection
        novel_query = {'title': 'underwater basket weaving', 'all_day': True}
        is_novel, avg_sim = search.detect_novel_event(novel_query)
        print(f"   ✓ Novelty detection: is_novel={is_novel}, avg_sim={avg_sim:.3f}")

        # Fallback
        fallback_results = search.find_similar_with_fallback(novel_query, k=2)
        print(f"   ✓ Fallback returned {len(fallback_results)} results")

    except Exception as e:
        print(f"   ✗ FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    print()

    print("=" * 70)
    print("✓ ALL TESTS PASSED - Similarity system is working!")
    print("=" * 70)
    return True


if __name__ == '__main__':
    success = test_basic_functionality()
    sys.exit(0 if success else 1)
