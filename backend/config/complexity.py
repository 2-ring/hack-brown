"""
Input complexity analysis for dynamic model selection.
Pure heuristics — no LLM call.
"""

import re
from enum import Enum
from dataclasses import dataclass
from typing import Optional


class ComplexityLevel(Enum):
    SIMPLE = "simple"
    COMPLEX = "complex"


@dataclass
class ComplexityResult:
    """Result of input complexity analysis."""
    level: ComplexityLevel
    score: int           # 0-100, higher = more complex
    reason: str          # Human-readable explanation for logging


class InputComplexityAnalyzer:
    """
    Heuristic-based input complexity analyzer.
    Determines whether to use light or standard LLM models.
    """

    # Threshold: score >= this means COMPLEX
    COMPLEXITY_THRESHOLD = 40

    # Patterns that suggest multiple events
    MULTI_EVENT_PATTERNS = [
        re.compile(r'^\s*\d+[\.\)]\s', re.MULTILINE),    # Numbered lists
        re.compile(r'^\s*[-*]\s', re.MULTILINE),           # Bullet lists
        re.compile(r'\b(also|another|additionally)\b', re.IGNORECASE),
    ]

    # Date/time patterns
    DATE_TIME_PATTERNS = [
        re.compile(r'\b\d{1,2}[:/]\d{2}\s*(am|pm)?\b', re.IGNORECASE),
        re.compile(r'\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b', re.IGNORECASE),
        re.compile(r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}', re.IGNORECASE),
        re.compile(r'\b\d{1,2}/\d{1,2}(/\d{2,4})?\b'),
        re.compile(r'\b(tomorrow|today|tonight|next\s+\w+)\b', re.IGNORECASE),
    ]

    @classmethod
    def analyze(cls, text: str, input_type: str = 'text', metadata: Optional[dict] = None) -> ComplexityResult:
        """
        Analyze input complexity to decide light vs standard models.

        Args:
            text: The input text to analyze
            input_type: 'text', 'image', 'pdf', 'audio', 'document'
            metadata: Optional metadata (e.g., requires_vision)

        Returns:
            ComplexityResult with level, score, and reason
        """
        score = 0
        reasons = []

        # Non-text inputs always use standard models
        if input_type in ('image', 'audio'):
            return ComplexityResult(
                level=ComplexityLevel.COMPLEX,
                score=80,
                reason=f"non-text input '{input_type}'"
            )

        # Vision inputs always use standard models
        if metadata and metadata.get('requires_vision'):
            return ComplexityResult(
                level=ComplexityLevel.COMPLEX,
                score=80,
                reason="vision input"
            )

        # Text length
        text_len = len(text)
        if text_len > 2000:
            score += 40
            reasons.append(f"long ({text_len} chars)")
        elif text_len > 500:
            score += 20
            reasons.append(f"medium ({text_len} chars)")
        elif text_len < 200:
            score -= 10
            reasons.append(f"short ({text_len} chars)")

        # Count date/time mentions
        datetime_count = sum(len(p.findall(text)) for p in cls.DATE_TIME_PATTERNS)
        if datetime_count > 4:
            score += 25
            reasons.append(f"{datetime_count} date/time refs")
        elif datetime_count > 2:
            score += 10
            reasons.append(f"{datetime_count} date/time refs")

        # Multi-event signals
        multi_event_signals = sum(len(p.findall(text)) for p in cls.MULTI_EVENT_PATTERNS)
        if multi_event_signals > 3:
            score += 25
            reasons.append(f"{multi_event_signals} multi-event signals")
        elif multi_event_signals > 0:
            score += 10
            reasons.append(f"{multi_event_signals} multi-event signals")

        # Line count
        line_count = text.count('\n') + 1
        if line_count > 20:
            score += 15
            reasons.append(f"{line_count} lines")

        # PDF/document source text is often messier
        if input_type in ('pdf', 'document'):
            score += 15
            reasons.append(f"from {input_type}")

        score = max(0, min(100, score))
        level = ComplexityLevel.COMPLEX if score >= cls.COMPLEXITY_THRESHOLD else ComplexityLevel.SIMPLE

        return ComplexityResult(
            level=level,
            score=score,
            reason=f"score={score} ({', '.join(reasons)})" if reasons else f"score={score}"
        )
