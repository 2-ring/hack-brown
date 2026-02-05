"""
Correction Query Service

Queries relevant corrections based on extracted facts similarity.
Provides specialized queries for different agent types.
"""

import numpy as np
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Optional
from database.supabase_client import get_supabase


class CorrectionQueryService:
    """
    Queries corrections based on agent needs.

    Key decision: Searches by extracted_facts similarity (what Agent 5 sees),
    not by original input or system suggestion.
    """

    def __init__(self):
        # Reuse same embedding model as storage service
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        self.embedding_model.max_seq_length = 256
        self.supabase = get_supabase()

    def query_for_fact_extraction(
        self,
        user_id: str,
        facts: Dict,
        k: int = 5
    ) -> List[Dict]:
        """
        Query corrections relevant to fact extraction (time/date).

        Args:
            user_id: User UUID
            facts: ExtractedFacts dict to search with
            k: Number of results to return

        Returns:
            List of corrections where time or date was changed
        """
        return self._query_by_fields_and_similarity(
            user_id=user_id,
            facts=facts,
            field_filter=['start_time', 'date', 'duration'],
            k=k
        )

    def query_for_title_formatting(
        self,
        user_id: str,
        facts: Dict,
        k: int = 5
    ) -> List[Dict]:
        """
        Query corrections relevant to title formatting.
        """
        return self._query_by_fields_and_similarity(
            user_id=user_id,
            facts=facts,
            field_filter=['title'],
            k=k
        )

    def query_for_calendar_selection(
        self,
        user_id: str,
        facts: Dict,
        k: int = 5
    ) -> List[Dict]:
        """
        Query corrections for calendar selection.
        """
        return self._query_by_fields_and_similarity(
            user_id=user_id,
            facts=facts,
            field_filter=['calendar'],
            k=k
        )

    def query_for_preference_application(
        self,
        user_id: str,
        facts: Dict,
        k: int = 10
    ) -> List[Dict]:
        """
        Query all relevant corrections for Agent 5 (Preference Application).

        This is the main use case - Agent 5 searching for corrections
        based on similar facts it has encountered before.

        Args:
            user_id: User UUID
            facts: ExtractedFacts dict (what Agent 5 is currently looking at)
            k: Number of results to return

        Returns:
            List of corrections ordered by similarity
        """
        # Get all corrections, prioritize by similarity
        return self._query_by_similarity(
            user_id=user_id,
            facts=facts,
            k=k
        )

    def _query_by_fields_and_similarity(
        self,
        user_id: str,
        facts: Dict,
        field_filter: List[str],
        k: int
    ) -> List[Dict]:
        """
        Combined filter: fields_changed AND semantic similarity.

        Strategy:
        1. Filter by user_id and fields_changed
        2. Retrieve all matching corrections
        3. Compute similarity in-memory
        4. Return top-k

        Note: This is the fallback approach for MVP. With pgvector, we can do
        vector search directly in SQL for better performance.
        """

        # 1. Fetch all corrections for this user where specified fields were changed
        # Note: Supabase Python client doesn't support array overlap directly,
        # so we fetch all and filter in memory (acceptable for MVP with <1000 corrections)
        try:
            result = self.supabase.table('event_corrections').select('*').eq('user_id', user_id).execute()
            corrections = result.data
        except Exception as e:
            print(f"Error querying corrections: {e}")
            return []

        if not corrections:
            return []

        # 2. Filter for field overlap
        filtered = [
            c for c in corrections
            if any(field in c.get('fields_changed', []) for field in field_filter)
        ]

        if not filtered:
            return []

        # 3. Compute similarity
        query_embedding = self._embed_facts(facts)

        scored = []
        for correction in filtered:
            # Get stored embedding
            stored_embedding = np.array(correction.get('facts_embedding', []))

            if stored_embedding.size == 0:
                continue

            # Cosine similarity
            similarity = float(np.dot(query_embedding, stored_embedding))

            scored.append((correction, similarity))

        # 4. Sort by similarity
        scored.sort(key=lambda x: x[1], reverse=True)

        # Return top-k
        return [c for c, score in scored[:k]]

    def _query_by_similarity(
        self,
        user_id: str,
        facts: Dict,
        k: int
    ) -> List[Dict]:
        """
        Query by semantic similarity only (no field filter).

        Main query method for Agent 5.
        """
        # Fetch all user corrections
        try:
            result = self.supabase.table('event_corrections').select('*').eq('user_id', user_id).execute()
            corrections = result.data
        except Exception as e:
            print(f"Error querying corrections: {e}")
            return []

        if not corrections:
            return []

        # Compute similarity
        query_embedding = self._embed_facts(facts)

        scored = []
        for correction in corrections:
            # Get stored embedding
            stored_embedding = np.array(correction.get('facts_embedding', []))

            if stored_embedding.size == 0:
                continue

            # Cosine similarity (embeddings are normalized)
            similarity = float(np.dot(query_embedding, stored_embedding))

            scored.append((correction, similarity))

        # Sort by similarity
        scored.sort(key=lambda x: x[1], reverse=True)

        # Return top-k
        return [c for c, score in scored[:k]]

    def _embed_facts(self, facts: Dict) -> np.ndarray:
        """
        Generate embedding for facts (same logic as storage service).
        """
        facts_text = self._facts_to_text(facts)

        embedding = self.embedding_model.encode(
            facts_text,
            convert_to_numpy=True,
            normalize_embeddings=True
        )

        return embedding

    def _facts_to_text(self, facts: Dict) -> str:
        """
        Convert ExtractedFacts dict to text (same logic as storage service).
        """
        parts = []

        if facts.get('title'):
            parts.append(str(facts['title']))

        if facts.get('date'):
            parts.append(str(facts['date']))

        if facts.get('time'):
            parts.append(str(facts['time']))

        if facts.get('location'):
            parts.append(str(facts['location']))

        if facts.get('notes'):
            parts.append(str(facts['notes']))

        if facts.get('calendar'):
            parts.append(f"calendar:{facts['calendar']}")

        return ' '.join(parts)
