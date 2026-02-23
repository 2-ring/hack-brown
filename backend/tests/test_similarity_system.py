"""
Unit tests for CalendarEventSimilarity

Tests each component of the multi-faceted similarity system:
- Semantic similarity (sentence transformers)
- Length similarity (sigmoid smoothing)
- Keyword extraction (course codes + important terms)
- Temporal matching
- Overall weighted combination
"""

import pytest
import sys
import os

# Add backend to path for imports
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)


class TestCalendarEventSimilarity:
    """Test suite for CalendarEventSimilarity class."""

    @pytest.fixture
    def similarity_service(self):
        """Create similarity service instance for testing."""
        # Import here to avoid circular imports during test discovery
        from pipeline.personalization.similarity import CalendarEventSimilarity
        return CalendarEventSimilarity()

    def test_semantic_similarity_high(self, similarity_service):
        """Test that semantically similar events score high."""
        event1 = {'title': 'math homework', 'all_day': True}
        event2 = {'title': 'mathematics homework assignment', 'all_day': True}

        score, breakdown = similarity_service.compute_similarity(event1, event2)

        assert breakdown['semantic'] > 0.7, f"Semantic score should be high, got {breakdown['semantic']:.3f}"
        assert score > 0.7, f"Overall score should be high, got {score:.3f}"

    def test_semantic_similarity_low(self, similarity_service):
        """Test that semantically different events score low."""
        event1 = {'title': 'math homework', 'all_day': True}
        event2 = {'title': 'doctor appointment', 'all_day': True}

        score, breakdown = similarity_service.compute_similarity(event1, event2)

        assert breakdown['semantic'] < 0.5, f"Semantic score should be low, got {breakdown['semantic']:.3f}"

    def test_length_similarity_same_length(self, similarity_service):
        """Test length similarity for events with same word count."""
        event1 = {'title': 'math homework', 'all_day': True}
        event2 = {'title': 'physics assignment', 'all_day': True}

        score, breakdown = similarity_service.compute_similarity(event1, event2)

        # Both have 2 words, should be perfect match
        assert breakdown['length'] > 0.95, f"Length score should be ~1.0, got {breakdown['length']:.3f}"

    def test_length_similarity_different_length(self, similarity_service):
        """Test length similarity for events with very different word counts."""
        event1 = {'title': 'HW', 'all_day': True}
        event2 = {'title': 'Complete the comprehensive mathematics homework assignment for this week', 'all_day': True}

        score, breakdown = similarity_service.compute_similarity(event1, event2)

        # 1 word vs 10 words, should be low
        assert breakdown['length'] < 0.5, f"Length score should be low, got {breakdown['length']:.3f}"

    def test_keyword_extraction_course_codes(self, similarity_service):
        """Test keyword extraction identifies course codes."""
        keywords = similarity_service._extract_keywords("MATH 0180 Homework due tomorrow")

        # Check for course code
        assert any('MATH' in k and '0180' in k for k in keywords), \
            f"Should extract course code, got {keywords}"

        # Check for important words
        assert 'homework' in keywords, f"Should extract 'homework', got {keywords}"

    def test_keyword_extraction_stopwords(self, similarity_service):
        """Test that stopwords are filtered out."""
        keywords = similarity_service._extract_keywords("The homework is due tomorrow")

        # Stopwords should be filtered
        assert 'the' not in keywords, "Stopword 'the' should be filtered"
        assert 'is' not in keywords, "Stopword 'is' should be filtered"

        # Important words should remain
        assert 'homework' in keywords, "Important word 'homework' should remain"
        assert 'tomorrow' in keywords, "Important word 'tomorrow' should remain"

    def test_keyword_similarity_high_overlap(self, similarity_service):
        """Test keyword similarity with high overlap."""
        event1 = {'title': 'CSCI 0200 lab assignment', 'all_day': True}
        event2 = {'title': 'CSCI 0200 homework', 'all_day': True}

        score, breakdown = similarity_service.compute_similarity(event1, event2)

        # Should have high keyword overlap (CSCI 0200)
        assert breakdown['keyword'] > 0.3, f"Keyword score should be decent, got {breakdown['keyword']:.3f}"

    def test_keyword_similarity_no_overlap(self, similarity_service):
        """Test keyword similarity with no overlap."""
        event1 = {'title': 'math homework', 'all_day': True}
        event2 = {'title': 'physics lecture', 'all_day': True}

        score, breakdown = similarity_service.compute_similarity(event1, event2)

        # Should have low keyword overlap
        assert breakdown['keyword'] < 0.3, f"Keyword score should be low, got {breakdown['keyword']:.3f}"

    def test_temporal_similarity_both_all_day(self, similarity_service):
        """Test temporal matching for both all-day events."""
        event1 = {'title': 'Event 1', 'all_day': True}
        event2 = {'title': 'Event 2', 'all_day': True}

        score, breakdown = similarity_service.compute_similarity(event1, event2)

        assert breakdown['temporal'] == 1.0, "Both all-day should have perfect temporal match"

    def test_temporal_similarity_both_timed(self, similarity_service):
        """Test temporal matching for both timed events."""
        event1 = {'title': 'Event 1', 'all_day': False}
        event2 = {'title': 'Event 2', 'all_day': False}

        score, breakdown = similarity_service.compute_similarity(event1, event2)

        assert breakdown['temporal'] == 1.0, "Both timed should have perfect temporal match"

    def test_temporal_similarity_mixed(self, similarity_service):
        """Test temporal matching for mixed event types."""
        event1 = {'title': 'Event 1', 'all_day': True}
        event2 = {'title': 'Event 2', 'all_day': False}

        score, breakdown = similarity_service.compute_similarity(event1, event2)

        assert breakdown['temporal'] == 0.5, "Mixed types should have 0.5 temporal score"

    def test_overall_similarity_integration(self, similarity_service):
        """Test that overall score is weighted combination of components."""
        event1 = {'title': 'MATH 0180 Homework', 'all_day': True}
        event2 = {'title': 'MATH 0180 Problem Set', 'all_day': True}

        score, breakdown = similarity_service.compute_similarity(event1, event2)

        # Manually compute weighted combination
        expected = (
            0.70 * breakdown['semantic'] +
            0.15 * breakdown['length'] +
            0.10 * breakdown['keyword'] +
            0.05 * breakdown['temporal']
        )

        assert abs(score - expected) < 0.001, \
            f"Score should be weighted combination. Expected {expected:.3f}, got {score:.3f}"

        assert score == breakdown['final'], "Final score should match returned score"

    def test_empty_title_handling(self, similarity_service):
        """Test handling of events with empty titles."""
        event1 = {'title': '', 'all_day': True}
        event2 = {'title': 'Some event', 'all_day': True}

        score, breakdown = similarity_service.compute_similarity(event1, event2)

        # Should return zero similarity
        assert score == 0.0, "Empty title should result in zero similarity"
        assert all(v == 0.0 for v in breakdown.values()), "All breakdown scores should be zero"

    def test_cache_functionality(self, similarity_service):
        """Test that embedding cache works."""
        initial_cache_size = similarity_service.get_cache_size()

        # Compute similarity (should cache embeddings)
        event1 = {'title': 'test event one', 'all_day': True}
        event2 = {'title': 'test event two', 'all_day': True}

        similarity_service.compute_similarity(event1, event2)

        # Cache should have grown
        after_cache_size = similarity_service.get_cache_size()
        assert after_cache_size > initial_cache_size, "Cache should grow after computing similarity"

        # Compute again with same events (should hit cache)
        similarity_service.compute_similarity(event1, event2)

        # Cache size shouldn't change
        final_cache_size = similarity_service.get_cache_size()
        assert final_cache_size == after_cache_size, "Cache size shouldn't change on cache hit"

    def test_cache_clear(self, similarity_service):
        """Test cache clearing."""
        # Add some items to cache
        event1 = {'title': 'test event', 'all_day': True}
        event2 = {'title': 'another event', 'all_day': True}
        similarity_service.compute_similarity(event1, event2)

        assert similarity_service.get_cache_size() > 0, "Cache should have items"

        # Clear cache
        similarity_service.clear_cache()

        assert similarity_service.get_cache_size() == 0, "Cache should be empty after clear"

    def test_weights_validation(self):
        """Test that invalid weights are rejected."""
        from pipeline.personalization.similarity import CalendarEventSimilarity, SimilarityWeights

        # Weights that don't sum to 1.0
        invalid_weights = SimilarityWeights(
            semantic=0.5,
            length=0.2,
            keyword=0.2,
            temporal=0.2  # Sum = 1.1, invalid
        )

        with pytest.raises(ValueError, match="must sum to 1.0"):
            CalendarEventSimilarity(weights=invalid_weights)

    def test_score_range(self, similarity_service):
        """Test that all scores are in [0, 1] range."""
        test_pairs = [
            ({'title': 'math homework', 'all_day': True}, {'title': 'MATH 0180 Homework', 'all_day': True}),
            ({'title': 'meeting', 'all_day': False}, {'title': 'doctor appointment', 'all_day': True}),
            ({'title': 'very long event title with many words', 'all_day': True}, {'title': 'short', 'all_day': False}),
        ]

        for event1, event2 in test_pairs:
            score, breakdown = similarity_service.compute_similarity(event1, event2)

            # Check final score
            assert 0.0 <= score <= 1.0, f"Score should be in [0,1], got {score}"

            # Check all component scores
            for component, value in breakdown.items():
                assert 0.0 <= value <= 1.0, f"{component} score should be in [0,1], got {value}"


class TestConvenienceFunctions:
    """Test helper functions."""

    def test_event_to_text(self):
        """Test event_to_text conversion."""
        from pipeline.personalization.similarity import event_to_text

        event = {
            'summary': 'Math Homework',
            'description': 'Chapter 5 problems',
            'location': 'Home',
            'calendar_name': 'Classes'
        }

        text = event_to_text(event)

        assert 'Math Homework' in text
        assert 'Chapter 5 problems' in text
        assert 'Home' in text
        assert 'calendar:Classes' in text

    def test_event_to_text_title_fallback(self):
        """Test that event_to_text uses 'title' if 'summary' missing."""
        from pipeline.personalization.similarity import event_to_text

        event = {
            'title': 'Event Title',
            'description': 'Some description'
        }

        text = event_to_text(event)

        assert 'Event Title' in text

    def test_event_to_text_long_description(self):
        """Test that long descriptions are truncated."""
        from pipeline.personalization.similarity import event_to_text

        event = {
            'summary': 'Event',
            'description': 'A' * 300  # Very long description
        }

        text = event_to_text(event)

        # Should be truncated to ~200 chars
        assert len(text) < 250


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
