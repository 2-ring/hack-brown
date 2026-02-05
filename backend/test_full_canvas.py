"""
Debug full Canvas text extraction
"""

from extraction.title_generator import TitleGenerator
import re

# Full Canvas text
canvas_text = """
Skip To Content
Dashboard
Lucas Kover Wolf
Account
Dashboard
Courses
Groups
Calendar
19 unread messages.19
Inbox
History
Help
Spring 2026 MATH 0180PagesExams

2026 Spring
Home
Pages
Gradescope
Media Library
Zoom
Exams
"""

def debug_full_text():
    print("=" * 70)
    print("DEBUGGING FULL CANVAS TEXT")
    print("=" * 70)

    generator = TitleGenerator()

    # Check if course code is found
    print("\n1. Checking for 'MATH 0180' in text:")
    if 'MATH 0180' in canvas_text or 'MATH0180' in canvas_text:
        print("   ✓ Found in text!")
        # Find position
        pos = canvas_text.find('MATH 0180')
        print(f"   Position: {pos}")
        print(f"   Context: ...{canvas_text[max(0,pos-20):pos+30]}...")
    else:
        print("   ✗ NOT found in text")

    # Try regex extraction
    print("\n2. Regex extraction:")
    matches = generator.course_code_pattern.findall(canvas_text)
    print(f"   Matches: {matches}")

    # Try on just first 1000 chars (what we use for KeyBERT)
    print("\n3. First 1000 chars:")
    sample = canvas_text[:1000]
    print(f"   Length: {len(sample)} chars")
    matches_sample = generator.course_code_pattern.findall(sample)
    print(f"   Matches in sample: {matches_sample}")

    # Generate title
    print("\n4. Generated title:")
    title = generator.generate(canvas_text, max_words=3)
    print(f"   '{title}'")

    print("\n" + "=" * 70)

if __name__ == "__main__":
    debug_full_text()
