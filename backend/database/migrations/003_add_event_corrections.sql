-- Migration: Add event_corrections table for feedback loop
-- Run this in Supabase SQL Editor
-- Stores user corrections to system-suggested events for learning

-- Enable pgvector extension if available (for efficient similarity search)
-- Note: If this fails, the table will fall back to JSONB storage for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create event_corrections table
CREATE TABLE IF NOT EXISTS event_corrections (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

  -- Core data (what changed)
  original_input TEXT NOT NULL,  -- From session.input_content (for context)
  extracted_facts JSONB NOT NULL,  -- Agent 2 output (what Agent 5 saw)
  system_suggestion JSONB NOT NULL,  -- Agent 5 output (what it produced)
  user_final JSONB NOT NULL,  -- What user actually submitted

  -- High-level analysis
  correction_type VARCHAR(50) NOT NULL,  -- 'title', 'time', 'date', 'calendar', 'color', 'location', 'description', 'multiple'
  fields_changed TEXT[] NOT NULL,  -- ['title', 'start_time', 'calendar']

  -- Detailed per-field breakdowns (JSONB for flexibility)
  title_change JSONB,  -- {from: "...", to: "...", change_type: "capitalization|length|content|formatting"}
  time_change JSONB,   -- {from: "14:00", to: "14:30", change_type: "hour|minute|timezone|all_day_toggle"}
  date_change JSONB,   -- {from: "2026-02-05", to: "2026-02-06", change_type: "day|relative_interpretation"}
  calendar_change JSONB,  -- {from: "Work", to: "Personal", change_type: "category_mismatch"}
  color_change JSONB,  -- {from: "1", to: "3", change_type: "preference"}
  location_change JSONB,  -- {from: "...", to: "...", change_type: "added|removed|modified"}
  description_change JSONB,  -- {from: "...", to: "...", change_type: "added|removed|modified"}
  duration_change JSONB,  -- {from: 60, to: 90, change_type: "lengthened|shortened"}

  -- Embedding for semantic search (Agent 5's input = ExtractedFacts)
  -- Try vector(384) first for pgvector, fall back to JSONB if unavailable
  facts_embedding vector(384),  -- Embedding of extracted_facts for similarity search

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Standard indexes
CREATE INDEX IF NOT EXISTS idx_corrections_user_id ON event_corrections(user_id);
CREATE INDEX IF NOT EXISTS idx_corrections_session_id ON event_corrections(session_id);
CREATE INDEX IF NOT EXISTS idx_corrections_type ON event_corrections(correction_type);
CREATE INDEX IF NOT EXISTS idx_corrections_created_at ON event_corrections(created_at DESC);

-- GIN index for array searching on fields_changed
CREATE INDEX IF NOT EXISTS idx_corrections_fields_changed ON event_corrections USING gin(fields_changed);

-- Vector index for fast similarity search (only if pgvector is available)
-- IVFFlat with 100 lists is good for up to ~10k corrections
-- Using cosine distance (vector_cosine_ops) for normalized embeddings
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    CREATE INDEX IF NOT EXISTS idx_corrections_facts_embedding ON event_corrections
      USING ivfflat (facts_embedding vector_cosine_ops) WITH (lists = 100);
  END IF;
END $$;

-- Comments for documentation
COMMENT ON TABLE event_corrections IS 'Stores user corrections to system-suggested events for feedback loop learning';
COMMENT ON COLUMN event_corrections.original_input IS 'The original messy input text (for context only, not embedded)';
COMMENT ON COLUMN event_corrections.extracted_facts IS 'Semantic facts extracted by Agent 2 (what Agent 5 saw as input)';
COMMENT ON COLUMN event_corrections.system_suggestion IS 'What Agent 5 produced (formatted event)';
COMMENT ON COLUMN event_corrections.user_final IS 'What the user actually submitted after editing';
COMMENT ON COLUMN event_corrections.correction_type IS 'Primary type of correction: title, time, date, calendar, color, location, description, or multiple';
COMMENT ON COLUMN event_corrections.fields_changed IS 'Array of all field names that were changed';
COMMENT ON COLUMN event_corrections.facts_embedding IS 'Vector embedding of extracted_facts for semantic similarity search (384-dim from sentence-transformers)';

-- Fallback: If pgvector is not available, drop vector column and use JSONB instead
-- Run this block ONLY if the vector column creation failed
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
--     ALTER TABLE event_corrections DROP COLUMN IF EXISTS facts_embedding;
--     ALTER TABLE event_corrections ADD COLUMN facts_embedding_b64 TEXT;
--     COMMENT ON COLUMN event_corrections.facts_embedding_b64 IS 'Base64-encoded embedding (fallback when pgvector unavailable)';
--   END IF;
-- END $$;
