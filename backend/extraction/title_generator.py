"""
Title Generator using KeyBERT
Generates concise 2-3 word titles for calendar events.
"""

import re
from typing import Optional
from keybert import KeyBERT


class TitleGenerator:
    """
    Generates concise titles from text using KeyBERT.
    Optimized for calendar event titles like 'MATH180 Syllabus', 'Team Meeting', etc.
    """

    def __init__(self):
        """Initialize KeyBERT model (uses sentence-transformers)"""
        # Use all-MiniLM-L6-v2 (fast, lightweight, good quality)
        self.model = KeyBERT('all-MiniLM-L6-v2')

        # Compile regex patterns for common event entities
        self.course_code_pattern = re.compile(r'\b[A-Z]{2,4}\s*\d{3,4}\b')
        self.event_type_pattern = re.compile(
            r'\b(exam|midterm|final|quiz|homework|assignment|project|'
            r'meeting|standup|sync|review|presentation|lecture|discussion|'
            r'deadline|due|submission|dinner|lunch|breakfast|coffee|talk|'
            r'seminar|workshop|conference)\b',
            re.IGNORECASE
        )

        # Patterns to filter out (times, dates, days, etc.)
        self.filter_patterns = [
            re.compile(r'\d+[ap]m\b', re.IGNORECASE),  # 2pm, 10am
            re.compile(r'\d{1,2}:\d{2}'),  # 14:00, 2:30
            re.compile(r'\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b', re.IGNORECASE),
            re.compile(r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b', re.IGNORECASE),
            re.compile(r'\b(tomorrow|today|tonight|tmrw)\b', re.IGNORECASE),
            re.compile(r'\b\d{1,2}th\b'),  # 25th, 3rd
            re.compile(r'\b(meet|meets|mwf|tth)\b', re.IGNORECASE),  # Generic meeting words
            re.compile(r'\b(rsvp)\b', re.IGNORECASE),
        ]

    def generate(
        self,
        text: str,
        max_words: int = 3,
        vision_metadata: Optional[dict] = None
    ) -> str:
        """
        Generate a concise title from text.

        Args:
            text: Input text to generate title from
            max_words: Maximum number of words in title (default: 3)
            vision_metadata: Optional metadata if processing image/PDF

        Returns:
            Concise title string (e.g., "MATH180 Midterm", "Team Meeting")

        Examples:
            >>> generate("MATH 0180 First Midterm Exam on Feb 25")
            'MATH180 Midterm Exam'

            >>> generate("Team standup meeting tomorrow at 10am with Sarah")
            'Team Standup Meeting'
        """
        if not text or len(text.strip()) == 0:
            return "Untitled Event"

        # Use first 1000 chars for speed (titles are usually at the beginning)
        text_sample = text[:1000]

        # Step 1: Extract high-priority entities (course codes, event types)
        entities = self._extract_priority_entities(text_sample)

        # Step 2: Extract keywords with KeyBERT
        try:
            keywords = self.model.extract_keywords(
                text_sample,
                keyphrase_ngram_range=(1, 2),  # 1-2 word phrases
                stop_words='english',
                top_n=5,
                use_maxsum=True  # Diversified keywords
            )
            # Extract just the keyword strings (ignore scores)
            keyword_phrases = [kw[0] for kw in keywords]
        except Exception as e:
            # Fallback if KeyBERT fails
            print(f"KeyBERT extraction failed: {e}")
            keyword_phrases = []

        # Step 3: Build title prioritizing entities + keywords
        title_parts = self._build_title(entities, keyword_phrases, max_words)

        # Step 4: Format and clean
        title = " ".join(title_parts)
        title = self._clean_title(title)

        return title if title else "Untitled Event"

    def _extract_priority_entities(self, text: str) -> dict:
        """Extract high-priority entities like course codes and event types"""
        entities = {
            'course_codes': [],
            'event_types': []
        }

        # Find course codes (e.g., MATH180, CS101)
        course_codes = self.course_code_pattern.findall(text)
        if course_codes:
            # Clean up spacing: "MATH 0180" -> "MATH180"
            entities['course_codes'] = [
                re.sub(r'\s+', '', code) for code in course_codes[:2]
            ]

        # Find event type keywords
        event_types = self.event_type_pattern.findall(text)
        if event_types:
            # Standardize: "midterm" -> "Midterm"
            entities['event_types'] = [
                evt.capitalize() for evt in event_types[:2]
            ]

        return entities

    def _build_title(
        self,
        entities: dict,
        keywords: list,
        max_words: int
    ) -> list:
        """Build title from entities and keywords"""
        title_parts = []

        # Priority 1: Course codes (e.g., MATH180)
        if entities['course_codes']:
            title_parts.append(entities['course_codes'][0])

        # Priority 2: Event types (e.g., Midterm, Meeting)
        if entities['event_types']:
            for event_type in entities['event_types']:
                if len(title_parts) < max_words:
                    # Avoid duplicates
                    if event_type.lower() not in " ".join(title_parts).lower():
                        title_parts.append(event_type)

        # Priority 3: KeyBERT keywords (semantic relevance)
        for keyword in keywords:
            if len(title_parts) >= max_words:
                break

            # Filter out unwanted patterns (times, dates, etc.)
            if self._should_filter_keyword(keyword):
                continue

            # Skip if already included (case-insensitive)
            current_title = " ".join(title_parts).lower()
            if keyword.lower() not in current_title:
                # Capitalize properly
                title_parts.append(keyword.title())

        return title_parts[:max_words]

    def _should_filter_keyword(self, keyword: str) -> bool:
        """Check if keyword should be filtered out"""
        for pattern in self.filter_patterns:
            if pattern.search(keyword):
                return True
        return False

    def _clean_title(self, title: str) -> str:
        """Clean and format title"""
        # Remove special characters
        title = re.sub(r'[^\w\s-]', '', title)

        # Collapse multiple spaces
        title = re.sub(r'\s+', ' ', title)

        # Strip whitespace
        title = title.strip()

        # Ensure proper capitalization
        words = title.split()
        cleaned_words = []
        for word in words:
            # Keep acronyms uppercase (MATH180, CS101)
            if word.isupper() or re.match(r'^[A-Z]+\d+$', word):
                cleaned_words.append(word)
            # Capitalize first letter of other words
            else:
                cleaned_words.append(word.capitalize())

        return " ".join(cleaned_words)


# Singleton instance for reuse
_title_generator_instance = None

def get_title_generator() -> TitleGenerator:
    """Get or create singleton TitleGenerator instance"""
    global _title_generator_instance
    if _title_generator_instance is None:
        _title_generator_instance = TitleGenerator()
    return _title_generator_instance
