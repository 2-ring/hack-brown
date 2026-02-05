"""
Test script for TitleGenerator
Demonstrates title generation with various inputs.
"""

from extraction.title_generator import TitleGenerator


def test_title_generation():
    """Test title generation with various calendar event inputs"""

    print("Initializing TitleGenerator...")
    generator = TitleGenerator()
    print("✓ Model loaded\n")

    # Test cases
    test_cases = [
        # Course-related events
        "MATH 0180 First Midterm Exam will be held on February 25th from 6:30-8:00pm. "
        "The exam covers chapters 1-4 and is closed book.",

        # Simple meeting
        "Team standup meeting tomorrow at 10am with Sarah and John to discuss sprint planning.",

        # Assignment deadline
        "ENGN 0520 Homework 3 is due on Tuesday at 9pm ET. Submit via Gradescope.",

        # Syllabus/course material
        "MATH 0180 Multivariable Calculus Syllabus - Spring 2026. Course meets MWF 10-11am.",

        # Social event
        "Shabbat dinner at Hillel this Friday at 6pm. RSVP by Thursday.",

        # Conference/talk
        "AI Safety and Alignment Research Talk by Dr. Smith on Monday 2pm in CIT 368.",

        # Project presentation
        "Final project presentation for CS 1410 - Database Systems. Wednesday March 15 at 3pm.",

        # Informal event
        "grabbing coffee with the team tmrw @ 2pm to chat about the new feature ideas"
    ]

    print("=" * 70)
    print("TITLE GENERATION TESTS")
    print("=" * 70)

    for i, text in enumerate(test_cases, 1):
        title = generator.generate(text, max_words=3)

        print(f"\n#{i}")
        print(f"Input: {text[:80]}..." if len(text) > 80 else f"Input: {text}")
        print(f"Title: '{title}'")
        print("-" * 70)

    print("\n✓ All tests completed!")


if __name__ == "__main__":
    test_title_generation()
