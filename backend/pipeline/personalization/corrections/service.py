"""
Correction Storage Service

Manages event corrections storage and retrieval.
Handles embedding generation and database operations.
"""

import json
import numpy as np
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Optional
from database.supabase_client import get_supabase
from .correction_analyzer import CorrectionAnalyzer


class CorrectionStorageService:
    """
    Manages event corrections storage and retrieval.

    Key decision: Embeds extracted_facts (STRUCTURE output) for similarity search,
    as this is what PERSONALIZE sees when making formatting decisions.
    """

    def __init__(self):
        from config.similarity import EmbeddingConfig
        self.analyzer = CorrectionAnalyzer()
        # Reuse existing embedding model (same as similarity search)
        self.embedding_model = SentenceTransformer(EmbeddingConfig.MODEL_NAME)
        self.embedding_model.max_seq_length = EmbeddingConfig.CORRECTION_MAX_SEQ_LENGTH
        self.supabase = get_supabase()

    def store_correction(
        self,
        user_id: str,
        session_id: str,
        original_input: str,
        extracted_facts: Dict,
        system_suggestion: Dict,
        user_final: Dict
    ) -> Optional[str]:
        """
        Analyze and store a single event correction.

        Args:
            user_id: User UUID
            session_id: Session UUID
            original_input: Original messy input text (for context)
            extracted_facts: STRUCTURE output (ExtractedFacts as dict)
            system_suggestion: PERSONALIZE output (formatted CalendarEvent)
            user_final: User's edited event

        Returns:
            correction_id (UUID) if stored, None if no changes detected
        """

        # 1. Analyze the correction
        analysis = self.analyzer.analyze_correction(
            system_suggestion,
            user_final,
            original_input
        )

        # If no changes, skip storing
        if not analysis or analysis['correction_type'] == 'none':
            return None

        # 2. Generate embedding of extracted_facts
        # This is what PERSONALIZE saw, so we search by this
        facts_embedding = self._embed_facts(extracted_facts)

        # 3. Prepare correction data
        correction_data = {
            'user_id': user_id,
            'session_id': session_id,
            'original_input': original_input,
            'extracted_facts': extracted_facts,
            'system_suggestion': system_suggestion,
            'user_final': user_final,
            'correction_type': analysis['correction_type'],
            'fields_changed': analysis['fields_changed'],
            'facts_embedding': facts_embedding.tolist(),  # Convert to list for JSONB/pgvector
        }

        # Add per-field change details
        for field_change_key in ['title_change', 'time_change', 'date_change',
                                   'calendar_change', 'color_change', 'location_change',
                                   'description_change', 'duration_change']:
            if field_change_key in analysis:
                correction_data[field_change_key] = analysis[field_change_key]

        # 4. Store in database
        try:
            result = self.supabase.table('event_corrections').insert(correction_data).execute()
            return result.data[0]['id']
        except Exception as e:
            print(f"Error storing correction: {e}")
            # Don't fail - just log and continue
            return None

    def store_corrections_from_session(
        self,
        user_id: str,
        session_id: str,
        user_submitted_events: List[Dict],
        extracted_facts_list: Optional[List[Dict]] = None
    ) -> List[str]:
        """
        Compare session.processed_events with user's submitted events.
        Store one correction per event that was changed.

        Args:
            user_id: User UUID
            session_id: Session UUID
            user_submitted_events: List of events user actually submitted (edited)
            extracted_facts_list: Optional list of ExtractedFacts from STRUCTURE
                                  If not provided, will attempt to reconstruct from system_suggestion

        Returns:
            List of correction IDs
        """
        # Get session
        from database.models import Session
        session_data = Session.get_by_id(session_id)

        if not session_data:
            raise ValueError(f"Session {session_id} not found")

        system_suggestions = session_data.get('processed_events', [])
        original_input = session_data.get('input_content', '')

        if not system_suggestions:
            raise ValueError(f"No processed_events in session {session_id}")

        # Match events (assume same order for MVP, can add matching logic later)
        correction_ids = []

        for idx, (system_event, user_event) in enumerate(zip(system_suggestions, user_submitted_events)):
            # Get extracted facts for this event
            if extracted_facts_list and idx < len(extracted_facts_list):
                extracted_facts = extracted_facts_list[idx]
            else:
                # Fallback: reconstruct facts from system_suggestion
                # This is imperfect but better than nothing
                extracted_facts = self._reconstruct_facts_from_suggestion(system_event)

            correction_id = self.store_correction(
                user_id=user_id,
                session_id=session_id,
                original_input=original_input,
                extracted_facts=extracted_facts,
                system_suggestion=system_event,
                user_final=user_event
            )

            if correction_id:
                correction_ids.append(correction_id)

        return correction_ids

    def _embed_facts(self, facts: Dict) -> np.ndarray:
        """
        Generate embedding for extracted facts.

        Converts ExtractedFacts dict to a text representation that captures
        the semantic content that PERSONALIZE sees.
        """
        # Convert facts to searchable text
        facts_text = self._facts_to_text(facts)

        # Generate embedding
        embedding = self.embedding_model.encode(
            facts_text,
            convert_to_numpy=True,
            normalize_embeddings=True  # For cosine similarity
        )

        return embedding

    def _facts_to_text(self, facts: Dict) -> str:
        """
        Convert ExtractedFacts dict to text for embedding.

        Example:
        {
            "title": "Math Homework",
            "date": "tomorrow",
            "time": None,
            "location": "Science Center"
        }
        →
        "Math Homework tomorrow Science Center"
        """
        parts = []

        # Include key fields in order of importance
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

        # Calendar assignment (if present in facts)
        if facts.get('calendar'):
            parts.append(f"calendar:{facts['calendar']}")

        # Join all parts
        facts_text = ' '.join(parts)

        return facts_text

    def _reconstruct_facts_from_suggestion(self, system_suggestion: Dict) -> Dict:
        """
        Reconstruct ExtractedFacts from system_suggestion.

        This is a fallback when we don't have the original STRUCTURE output.
        Not perfect, but allows the system to work without storing intermediate facts.
        """
        facts = {}

        # Extract title
        if 'summary' in system_suggestion:
            facts['title'] = system_suggestion['summary']

        # Extract date/time
        if 'start' in system_suggestion:
            start = system_suggestion['start']
            if 'dateTime' in start:
                # Parse datetime
                date_str = start['dateTime'].split('T')[0]
                time_str = start['dateTime'].split('T')[1] if 'T' in start['dateTime'] else None
                facts['date'] = date_str
                facts['time'] = time_str
            elif 'date' in start:
                facts['date'] = start['date']
                facts['time'] = None

        # Extract location
        if 'location' in system_suggestion:
            facts['location'] = system_suggestion['location']

        # Extract description as notes
        if 'description' in system_suggestion:
            facts['notes'] = system_suggestion['description']

        # Extract calendar if present
        if 'calendar' in system_suggestion:
            facts['calendar'] = system_suggestion['calendar']

        return facts
