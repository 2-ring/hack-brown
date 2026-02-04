"""
Quick test script for CalendarEventSimilarity

Tests the basic functionality of the similarity engine.
"""

import sys
sys.path.insert(0, '/home/lucas/files/university/startups/hack@brown/backend')

from preferences.similarity import CalendarEventSimilarity

def test_basic_similarity():
    """Test basic similarity computation."""
    print("=" * 60)
    print("TESTING: CalendarEventSimilarity")
    print("=" * 60)
    print()

    # Initialize
    print("1. Initializing similarity engine...")
    similarity = CalendarEventSimilarity()
    print(f"   ✓ Cache size: {similarity.get_cache_size()}")
    print()

    # Test cases
    test_cases = [
        {
            'name': 'Semantically similar (math homework)',
            'query': {'title': 'math homework', 'all_day': True},
            'candidate': {'title': 'MATH 0180 Homework', 'all_day': True},
            'expected_high': True
        },
        {
            'name': 'Very similar (identical meaning)',
            'query': {'title': 'Team meeting', 'all_day': False},
            'candidate': {'title': 'team standup meeting', 'all_day': False},
            'expected_high': True
        },
        {
            'name': 'Different topics',
            'query': {'title': 'math homework', 'all_day': True},
            'candidate': {'title': 'doctor appointment', 'all_day': False},
            'expected_high': False
        },
        {
            'name': 'Course code matching',
            'query': {'title': 'CSCI 0200 lab', 'all_day': False},
            'candidate': {'title': 'CSCI 0200 Homework', 'all_day': True},
            'expected_high': True
        }
    ]

    print("2. Running test cases...")
    print()

    for i, test in enumerate(test_cases, 1):
        print(f"Test {i}: {test['name']}")
        print(f"  Query:     {test['query']['title']}")
        print(f"  Candidate: {test['candidate']['title']}")

        score, breakdown = similarity.compute_similarity(
            test['query'],
            test['candidate']
        )

        print(f"  Score: {score:.3f}")
        print(f"  Breakdown:")
        print(f"    - Semantic:  {breakdown['semantic']:.3f}")
        print(f"    - Length:    {breakdown['length']:.3f}")
        print(f"    - Keyword:   {breakdown['keyword']:.3f}")
        print(f"    - Temporal:  {breakdown['temporal']:.3f}")

        # Check expectation
        if test['expected_high']:
            status = "✓ PASS" if score > 0.7 else "✗ FAIL"
            print(f"  Expected: HIGH (>0.7) | {status}")
        else:
            status = "✓ PASS" if score < 0.6 else "✗ FAIL"
            print(f"  Expected: LOW (<0.6) | {status}")

        print()

    print("3. Cache statistics:")
    print(f"   Final cache size: {similarity.get_cache_size()}")
    print()

    print("=" * 60)
    print("✓ Testing complete!")
    print("=" * 60)


if __name__ == '__main__':
    test_basic_similarity()
