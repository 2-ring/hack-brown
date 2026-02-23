"""
Data models for semantic similarity search results.

These models provide structured representations of similarity search results,
including detailed breakdowns of different similarity components and metadata.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional


class SimilarityBreakdown(BaseModel):
    """
    Detailed breakdown of similarity scores for transparency and debugging.

    Shows contribution of each component to the final similarity score.
    """

    semantic: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Semantic similarity score from sentence embeddings (cosine similarity)"
    )

    length: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Length similarity score (sigmoid-smoothed word count difference)"
    )

    keyword: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Keyword overlap score (Jaccard similarity on important terms)"
    )

    temporal: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Temporal similarity score (all-day vs timed event matching)"
    )

    final: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Weighted final similarity score"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "semantic": 0.92,
                "length": 0.85,
                "keyword": 0.75,
                "temporal": 1.0,
                "final": 0.89
            }
        }


class SimilarEvent(BaseModel):
    """
    Event with similarity metadata attached.

    Represents a historical event that was deemed similar to a query event,
    including the similarity score and detailed breakdown.
    """

    event: Dict = Field(
        ...,
        description="Original calendar event dictionary with all fields"
    )

    similarity_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Final weighted similarity score"
    )

    breakdown: SimilarityBreakdown = Field(
        ...,
        description="Detailed breakdown of similarity components"
    )

    rank: int = Field(
        ...,
        ge=1,
        description="Rank in the search results (1 = most similar)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "event": {
                    "id": "event123",
                    "title": "MATH 0180 Homework",
                    "start": {"dateTime": "2026-02-06T21:00:00-05:00"},
                    "all_day": True,
                    "calendar_name": "Classes"
                },
                "similarity_score": 0.89,
                "breakdown": {
                    "semantic": 0.92,
                    "length": 0.85,
                    "keyword": 0.75,
                    "temporal": 1.0,
                    "final": 0.89
                },
                "rank": 1
            }
        }


class SimilaritySearchResult(BaseModel):
    """
    Complete result set from a similarity search.

    Contains all similar events found, metadata about the search,
    and performance statistics.
    """

    query: str = Field(
        ...,
        description="Original query string used for similarity search"
    )

    results: List[SimilarEvent] = Field(
        default_factory=list,
        description="List of similar events, ordered by similarity score (highest first)"
    )

    search_time_ms: float = Field(
        ...,
        ge=0.0,
        description="Time taken to perform the search in milliseconds"
    )

    cache_hit: bool = Field(
        default=False,
        description="Whether this result was served from cache"
    )

    total_candidates: Optional[int] = Field(
        None,
        description="Total number of events searched (before filtering/ranking)"
    )

    num_results: int = Field(
        default=0,
        description="Number of results returned (convenience field)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "query": "math homework friday",
                "results": [
                    {
                        "event": {
                            "id": "event123",
                            "title": "MATH 0180 Homework",
                            "all_day": True
                        },
                        "similarity_score": 0.89,
                        "breakdown": {
                            "semantic": 0.92,
                            "length": 0.85,
                            "keyword": 0.75,
                            "temporal": 1.0,
                            "final": 0.89
                        },
                        "rank": 1
                    }
                ],
                "search_time_ms": 12.5,
                "cache_hit": False,
                "total_candidates": 1000,
                "num_results": 1
            }
        }

    def __init__(self, **data):
        super().__init__(**data)
        # Auto-compute num_results
        self.num_results = len(self.results)


class SimilarityWeights(BaseModel):
    """
    Weights for different similarity components.

    Used to configure the hybrid similarity scoring function.
    Based on research showing semantic (70%), structural (20%), and contextual (10%) signals.
    """

    semantic: float = Field(
        0.70,
        ge=0.0,
        le=1.0,
        description="Weight for semantic similarity (embedding-based)"
    )

    length: float = Field(
        0.15,
        ge=0.0,
        le=1.0,
        description="Weight for length similarity (structural)"
    )

    keyword: float = Field(
        0.10,
        ge=0.0,
        le=1.0,
        description="Weight for keyword overlap"
    )

    temporal: float = Field(
        0.05,
        ge=0.0,
        le=1.0,
        description="Weight for temporal matching (all-day vs timed)"
    )

    def validate_sum(self) -> bool:
        """Validate that weights sum to approximately 1.0."""
        total = self.semantic + self.length + self.keyword + self.temporal
        return abs(total - 1.0) < 0.01  # Allow small floating point error

    class Config:
        json_schema_extra = {
            "example": {
                "semantic": 0.70,
                "length": 0.15,
                "keyword": 0.10,
                "temporal": 0.05
            }
        }


class SimilarityCacheStats(BaseModel):
    """
    Statistics about the similarity search cache.

    Used for monitoring cache performance and tuning.
    """

    cache_size: int = Field(
        ...,
        ge=0,
        description="Number of entries currently in cache"
    )

    cache_hits: int = Field(
        ...,
        ge=0,
        description="Total number of cache hits"
    )

    cache_misses: int = Field(
        ...,
        ge=0,
        description="Total number of cache misses"
    )

    hit_rate: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Cache hit rate (hits / total_requests)"
    )

    total_requests: int = Field(
        ...,
        ge=0,
        description="Total number of search requests"
    )

    avg_search_time_ms: Optional[float] = Field(
        None,
        description="Average search time in milliseconds"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "cache_size": 245,
                "cache_hits": 789,
                "cache_misses": 211,
                "hit_rate": 0.789,
                "total_requests": 1000,
                "avg_search_time_ms": 8.5
            }
        }
