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
        # More flexible course code pattern (no trailing boundary required for Canvas text)
        self.course_code_pattern = re.compile(r'\b([A-Z]{2,4})\s*(\d{3,4})')

        # Canvas page title pattern - improved to handle special chars and multi-word titles
        # Matches "Pages" followed by capitalized words, spaces, and common punctuation
        self.canvas_page_pattern = re.compile(r'Pages\s*([A-Z][a-z]+(?:[\s&]+[A-Z][a-z]+)*)')

        self.event_type_pattern = re.compile(
            r'\b(exams?|midterm|final|quiz|quizzes|homework|assignment|project|'
            r'meeting|standup|sync|review|presentation|lecture|discussion|'
            r'deadline|submission|dinner|lunch|breakfast|coffee|talk|'
            r'seminar|workshop|conference|schedule|syllabus|contact|office|hours)\b',
            re.IGNORECASE
        )

        # Patterns to filter out (times, dates, days, navigation, etc.)
        self.filter_patterns = [
            re.compile(r'\d+[ap]m\b', re.IGNORECASE),  # 2pm, 10am
            re.compile(r'\d{1,2}:\d{2}'),  # 14:00, 2:30
            re.compile(r'\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b', re.IGNORECASE),
            re.compile(r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b', re.IGNORECASE),
            re.compile(r'\b(spring|fall|winter|summer)\b', re.IGNORECASE),
            re.compile(r'\b(tomorrow|today|tonight|tmrw)\b', re.IGNORECASE),
            re.compile(r'\b\d{1,2}th\b'),  # 25th, 3rd
            re.compile(r'\b(meet|meets|mwf|tth)\b', re.IGNORECASE),  # Generic meeting words
            re.compile(r'\b(rsvp)\b', re.IGNORECASE),
            # Years (2024, 2025, 2026, etc.)
            re.compile(r'\b(20\d{2}|19\d{2})\b'),  # 2024, 2025, etc.
            # Canvas/navigation terms
            re.compile(r'\b(dashboard|calendar|inbox|history|help|pages|home|skip|content|links|external|site)\b', re.IGNORECASE),
            # Generic academic/web junk words
            re.compile(r'\b(homework|textbook|notes|due|edu|com|org|provide|instructional|scheduled|unread|messages)\b', re.IGNORECASE),
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

        # Step 1: Preprocess - clean noise, separate concatenated words, extract structure
        cleaned_text, metadata = self._preprocess_text(text)

        # Step 2: Extract high-priority entities from cleaned text
        entities = self._extract_priority_entities(cleaned_text, metadata)

        # Step 3: Extract keywords with KeyBERT on cleaned text
        try:
            keywords = self.model.extract_keywords(
                cleaned_text[:1000],  # Use cleaned text, still sample for speed
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

        # Step 4: Build title prioritizing entities + keywords
        title_parts = self._build_title(entities, keyword_phrases, max_words)

        # Step 5: Format and clean
        title = " ".join(title_parts)
        title = self._clean_title(title)

        return title if title else "Untitled Event"

    def _preprocess_text(self, text: str) -> tuple[str, dict]:
        """
        Preprocess text to remove noise and extract structural metadata.
        This improves KeyBERT's ability to find meaningful keywords.

        Returns:
            tuple: (cleaned_text, metadata)
        """
        metadata = {}

        # Extract Canvas page titles BEFORE cleaning (e.g., "PagesContact Info" -> 'Contact Info')
        # Look in original text first, then after word separation
        canvas_match = self.canvas_page_pattern.search(text)
        if not canvas_match:
            # Try after separating concatenated words
            temp_separated = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
            canvas_match = self.canvas_page_pattern.search(temp_separated)

        if canvas_match:
            page_title = canvas_match.group(1).strip()
            # Clean up the page title (remove & and extra spaces)
            page_title = re.sub(r'\s*&\s*', ' ', page_title)  # "Contact & Info" -> "Contact Info"

            # Keep only first 2 meaningful words (more focused titles)
            # "Contact Info Office Hours" -> "Contact Info"
            words = page_title.split()[:2]
            page_title = ' '.join(words)

            metadata['page_title'] = page_title

        # Remove navigation boilerplate common in web extractions
        navigation_terms = [
            'Skip To Content', 'Dashboard', 'Account', 'Courses', 'Groups',
            'Calendar', 'Inbox', 'History', 'Help', 'Pages', 'Home',
            'Media Library', 'Zoom', 'Gradescope', 'unread messages'
        ]

        cleaned = text
        for nav_term in navigation_terms:
            # Case insensitive removal
            cleaned = re.sub(rf'\b{re.escape(nav_term)}\b', '', cleaned, flags=re.IGNORECASE)

        # Separate concatenated words (e.g., "PagesExams" -> "Pages Exams")
        # Look for lowercase followed by uppercase
        cleaned = re.sub(r'([a-z])([A-Z])', r'\1 \2', cleaned)

        # Remove excessive whitespace and normalize
        cleaned = re.sub(r'\s+', ' ', cleaned)
        cleaned = cleaned.strip()

        return cleaned, metadata

    def _extract_priority_entities(self, text: str, metadata: dict) -> dict:
        """Extract high-priority entities like course codes, event types, and page titles"""
        entities = {
            'course_codes': [],
            'event_types': [],
            'page_titles': []
        }

        # Find course codes (e.g., MATH180, CS101)
        # Now handles concatenated text better thanks to preprocessing
        course_matches = self.course_code_pattern.findall(text)
        if course_matches:
            # Pattern returns tuples: (dept, number)
            entities['course_codes'] = [
                f"{dept}{number}" for dept, number in course_matches[:2]
            ]

        # Find event type keywords
        event_types = self.event_type_pattern.findall(text)
        if event_types:
            # Standardize: "midterm" -> "Midterm"
            entities['event_types'] = [
                evt.capitalize() for evt in event_types[:2]
            ]

        # Use extracted page titles from metadata (e.g., Canvas page names)
        if 'page_title' in metadata:
            entities['page_titles'].append(metadata['page_title'])

        return entities

    def _build_title(
        self,
        entities: dict,
        keywords: list,
        max_words: int
    ) -> list:
        """
        Build title from entities and keywords.
        Prioritizes content type over specific identifiers (e.g., "Math Exams" over "MATH180 Exams").
        """
        title_parts = []

        def count_words(parts):
            """Count total words in title parts"""
            return sum(len(part.split()) for part in parts)

        # Priority 1: Page titles from structured sources (e.g., Canvas page names)
        if entities.get('page_titles'):
            page_title = entities['page_titles'][0]
            # Only add if it fits within max_words
            if count_words([page_title]) <= max_words:
                title_parts.append(page_title)

        # Priority 2: Event types (e.g., Exams, Meeting, Syllabus)
        if entities.get('event_types'):
            for event_type in entities['event_types']:
                # Check if adding this would exceed max_words
                if count_words(title_parts + [event_type]) > max_words:
                    break
                # Avoid duplicates
                if event_type.lower() not in " ".join(title_parts).lower():
                    title_parts.append(event_type)

        # Priority 3: KeyBERT keywords (semantic relevance)
        for keyword in keywords:
            # Check word count, not phrase count
            if count_words(title_parts + [keyword]) > max_words:
                break

            # Filter out unwanted patterns (times, dates, etc.)
            if self._should_filter_keyword(keyword):
                continue

            # Skip if any word in keyword already appears in title
            current_title_lower = " ".join(title_parts).lower()
            keyword_lower = keyword.lower()

            # Check for overlap
            keyword_words = keyword_lower.split()
            title_words = current_title_lower.split()
            has_overlap = any(kw in title_words or any(kw in tw for tw in title_words) for kw in keyword_words)

            if not has_overlap:
                # Capitalize properly
                title_parts.append(keyword.title())

        # Priority 4: Course codes (if we still have space, add as context)
        # Lower priority per user feedback - "Math Exams" is better than "MATH180 Exams"
        if count_words(title_parts) < max_words and entities.get('course_codes'):
            # Extract just the subject (e.g., "MATH" from "MATH180")
            course_code = entities['course_codes'][0]
            subject = re.match(r'^([A-Z]+)', course_code)
            if subject:
                subject_name = subject.group(1).capitalize()
                # Only add if not redundant and fits
                if subject_name.lower() not in " ".join(title_parts).lower():
                    if count_words([subject_name] + title_parts) <= max_words:
                        title_parts.insert(0, subject_name)  # Prefix for context

        return title_parts

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
