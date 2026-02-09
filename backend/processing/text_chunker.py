"""
Smart text chunking for large inputs.
Splits text on natural boundaries with overlap so events spanning
chunk edges are not lost.
"""

import re
import logging
from dataclasses import dataclass
from typing import List

from config.processing import ProcessingConfig

logger = logging.getLogger(__name__)


@dataclass
class TextChunk:
    """A chunk of text with its position metadata."""
    text: str
    start_offset: int
    end_offset: int
    chunk_index: int


# Boundary detection regex patterns, ordered by priority (lower = stronger)

# Priority 1: Email-style boundaries
EMAIL_BOUNDARY = re.compile(
    r'\n\s*(?:'
    r'-{3,}'
    r'|={3,}'
    r'|_{3,}'
    r'|From:\s'
    r'|Sent:\s'
    r'|Date:\s'
    r'|Subject:\s'
    r'|On\s.+wrote:'
    r'|>{3,}'
    r'|Forwarded message'
    r')',
    re.IGNORECASE
)

# Priority 2: Section headers
SECTION_HEADER = re.compile(
    r'\n\s*(?:'
    r'#{1,4}\s'
    r'|\d+\.\s+[A-Z]'
    r'|[A-Z][A-Z\s]{4,}(?:\n|$)'
    r'|Week\s+\d+'
    r'|Module\s+\d+'
    r'|Chapter\s+\d+'
    r'|Part\s+\d+'
    r')',
    re.IGNORECASE
)

# Priority 3: Double newlines (paragraph breaks)
DOUBLE_NEWLINE = re.compile(r'\n\s*\n')

# Priority 4: Single newlines
SINGLE_NEWLINE = re.compile(r'\n')


def split_text(
    text: str,
    target_size: int = None,
    overlap: int = None,
) -> List[TextChunk]:
    """
    Split text into overlapping chunks at natural boundaries.

    If text <= target_size, returns a single chunk (no splitting).
    Otherwise finds candidate split points (email boundaries, section headers,
    paragraph breaks, newlines) and greedily builds chunks near target_size,
    then adds overlap regions at word boundaries.

    Args:
        text: The full input text.
        target_size: Target characters per chunk. Default from ProcessingConfig.
        overlap: Characters of overlap between chunks. Default from ProcessingConfig.

    Returns:
        List of TextChunk objects.
    """
    if target_size is None:
        target_size = ProcessingConfig.CHUNK_TARGET_SIZE
    if overlap is None:
        overlap = ProcessingConfig.CHUNK_OVERLAP

    if len(text) <= target_size:
        return [TextChunk(text=text, start_offset=0, end_offset=len(text), chunk_index=0)]

    split_candidates = _find_split_candidates(text)
    ranges = _greedy_chunk(text, split_candidates, target_size)
    chunks = _add_overlap(text, ranges, overlap)

    logger.info(
        f"Split {len(text)} chars into {len(chunks)} chunks "
        f"(target={target_size}, overlap={overlap})"
    )

    return chunks


def _find_split_candidates(text: str) -> List[tuple]:
    """
    Find all candidate split points with priorities.
    Returns list of (position, priority) sorted by position then priority.
    """
    candidates = []

    for match in EMAIL_BOUNDARY.finditer(text):
        candidates.append((match.start(), 1))

    for match in SECTION_HEADER.finditer(text):
        candidates.append((match.start(), 2))

    for match in DOUBLE_NEWLINE.finditer(text):
        candidates.append((match.end(), 3))

    for match in SINGLE_NEWLINE.finditer(text):
        candidates.append((match.end(), 4))

    candidates.sort(key=lambda x: (x[0], x[1]))
    return candidates


def _greedy_chunk(
    text: str,
    split_candidates: List[tuple],
    target_size: int,
) -> List[tuple]:
    """
    Greedily partition text into (start, end) ranges.

    For each chunk, searches for the best split candidate in the window
    [target_size * CHUNK_WINDOW_MIN_RATIO, target_size * CHUNK_WINDOW_MAX_RATIO]
    from the current position.
    Picks the highest-priority (lowest number) candidate closest to target_size.
    """
    ranges = []
    pos = 0
    text_len = len(text)
    window_min = ProcessingConfig.CHUNK_WINDOW_MIN_RATIO
    window_max = ProcessingConfig.CHUNK_WINDOW_MAX_RATIO

    while pos < text_len:
        if text_len - pos <= int(target_size * window_max):
            ranges.append((pos, text_len))
            break

        window_start = pos + int(target_size * window_min)
        window_end = pos + int(target_size * window_max)

        window_candidates = [
            (p, pri) for (p, pri) in split_candidates
            if window_start <= p <= window_end
        ]

        if window_candidates:
            best_priority = min(c[1] for c in window_candidates)
            best_candidates = [c for c in window_candidates if c[1] == best_priority]
            ideal_pos = pos + target_size
            split_pos = min(best_candidates, key=lambda c: abs(c[0] - ideal_pos))[0]
        else:
            fallback = [p for (p, _) in split_candidates if pos < p <= window_end]
            if fallback:
                split_pos = fallback[-1]
            else:
                split_pos = pos + target_size

        ranges.append((pos, split_pos))
        pos = split_pos

    return ranges


def _add_overlap(
    text: str,
    ranges: List[tuple],
    overlap: int,
) -> List[TextChunk]:
    """
    Extend each chunk's boundaries to create overlap regions,
    snapping to the nearest word boundary.
    """
    chunks = []
    text_len = len(text)

    for idx, (start, end) in enumerate(ranges):
        overlap_start = start
        if idx > 0:
            desired_start = max(0, start - overlap)
            space_pos = text.rfind(' ', desired_start, start)
            newline_pos = text.rfind('\n', desired_start, start)
            snap_pos = max(space_pos, newline_pos)
            overlap_start = snap_pos + 1 if snap_pos > desired_start else desired_start

        overlap_end = end
        if idx < len(ranges) - 1:
            desired_end = min(text_len, end + overlap)
            space_pos = text.find(' ', end, desired_end)
            newline_pos = text.find('\n', end, desired_end)
            if space_pos == -1:
                space_pos = desired_end
            if newline_pos != -1:
                space_pos = min(space_pos, newline_pos)
            overlap_end = space_pos if space_pos > end else desired_end

        chunks.append(TextChunk(
            text=text[overlap_start:overlap_end],
            start_offset=overlap_start,
            end_offset=overlap_end,
            chunk_index=idx,
        ))

    return chunks
