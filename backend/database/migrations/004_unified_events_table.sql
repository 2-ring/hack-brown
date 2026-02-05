-- Migration 004: Unified Events Table (Simplified)
-- A single table for ALL events - historical, drafts, created
-- Clean constraints, colocated corrections, simple session references

-- ============================================================================
-- Enable Required Extensions
-- ============================================================================

-- Enable pgvector for similarity search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Core Events Table - The Single Source of Truth
-- ============================================================================

CREATE TABLE IF NOT EXISTS events (
  -- ============================================================================
  -- Identity
  -- ============================================================================
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- ============================================================================
  -- Source & Provider Tracking
  -- ============================================================================

  -- Where this event came from
  provider VARCHAR(50) NOT NULL,  -- 'google', 'dropcal', 'apple', 'microsoft'

  -- Provider account (e.g., 'lucaskoverwolf@gmail.com')
  -- NULL if provider = 'dropcal', required otherwise
  provider_account_id VARCHAR(255),

  -- Provider's event ID (e.g., Google Calendar event ID)
  -- NULL until synced to provider
  provider_event_id VARCHAR(255),

  -- ============================================================================
  -- Lifecycle
  -- ============================================================================

  -- Is this a draft (user reviewing) or confirmed?
  -- Only TRUE if provider = 'dropcal'
  is_draft BOOLEAN DEFAULT FALSE,

  -- Soft delete
  deleted_at TIMESTAMPTZ,

  -- ============================================================================
  -- Event Data (Google Calendar API format)
  -- ============================================================================

  summary TEXT NOT NULL,
  description TEXT,
  location TEXT,

  -- Time (either use start_time/end_time OR start_date/end_date)
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  start_date DATE,
  end_date DATE,
  is_all_day BOOLEAN DEFAULT FALSE,

  timezone VARCHAR(100),  -- IANA timezone (e.g., "America/New_York")

  -- Calendar metadata
  calendar_name VARCHAR(255),  -- "Work", "Personal", etc.
  color_id VARCHAR(10),  -- Google Calendar color ID (1-11)

  -- ============================================================================
  -- DropCal Intelligence (only for provider='dropcal' events)
  -- ============================================================================

  -- Original extraction context
  original_input TEXT,  -- The raw messy text user submitted
  extracted_facts JSONB,  -- Agent 2 output (what Agent 5 saw)
  system_suggestion JSONB,  -- Agent 5 output (before user edits)

  -- User correction tracking
  user_modified BOOLEAN DEFAULT FALSE,  -- Did user edit the suggestion?

  -- Correction history (append-only audit log)
  -- Format: [{"timestamp": "...", "field": "title", "old_value": "...", "new_value": "...", "change_type": "..."}]
  correction_history JSONB,

  -- ============================================================================
  -- Machine Learning
  -- ============================================================================

  -- Pre-computed embedding for semantic similarity search
  event_embedding vector(384),  -- Sentence-transformers (all-MiniLM-L6-v2)

  -- Auto-computed time features for pattern analysis
  day_of_week INTEGER,  -- 0=Monday, 6=Sunday
  hour_of_day INTEGER,  -- 0-23
  duration_minutes INTEGER,  -- Computed from start/end

  -- ============================================================================
  -- Sync Metadata
  -- ============================================================================

  last_synced_at TIMESTAMPTZ,  -- When we last synced with provider
  sync_error TEXT,  -- Last sync error message (if any)

  -- ============================================================================
  -- Timestamps
  -- ============================================================================

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- ============================================================================
  -- Constraints
  -- ============================================================================

  -- Provider account rules
  CHECK (
    (provider = 'dropcal' AND provider_account_id IS NULL) OR
    (provider != 'dropcal' AND provider_account_id IS NOT NULL)
  ),

  -- Draft rules (only DropCal events can be drafts)
  CHECK (
    (provider = 'dropcal') OR
    (provider != 'dropcal' AND is_draft = FALSE)
  ),

  -- Time consistency (either timestamptz OR date, not both)
  CHECK (
    (is_all_day = TRUE AND start_date IS NOT NULL AND end_date IS NOT NULL) OR
    (is_all_day = FALSE AND start_time IS NOT NULL AND end_time IS NOT NULL)
  ),

  -- Unique constraint: one event per provider account + provider event ID
  UNIQUE(user_id, provider, provider_account_id, provider_event_id)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Primary user lookups
CREATE INDEX idx_events_user_id
  ON events(user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_events_user_provider
  ON events(user_id, provider)
  WHERE deleted_at IS NULL;

-- Draft workflow
CREATE INDEX idx_events_drafts
  ON events(user_id, is_draft, created_at DESC)
  WHERE is_draft = TRUE AND deleted_at IS NULL;

-- Time-based queries (conflict detection, scheduling analysis)
CREATE INDEX idx_events_time_range
  ON events(user_id, start_time, end_time)
  WHERE deleted_at IS NULL AND start_time IS NOT NULL;

CREATE INDEX idx_events_date_range
  ON events(user_id, start_date, end_date)
  WHERE deleted_at IS NULL AND is_all_day = TRUE;

-- Provider sync tracking
CREATE INDEX idx_events_provider_id
  ON events(user_id, provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX idx_events_pending_sync
  ON events(user_id, is_draft, provider_event_id)
  WHERE is_draft = FALSE AND provider_event_id IS NULL AND deleted_at IS NULL;

-- Pattern discovery queries
CREATE INDEX idx_events_historical
  ON events(user_id, provider, created_at DESC)
  WHERE provider != 'dropcal' AND deleted_at IS NULL;

CREATE INDEX idx_events_calendar_name
  ON events(user_id, calendar_name)
  WHERE deleted_at IS NULL AND calendar_name IS NOT NULL;

-- User correction tracking
CREATE INDEX idx_events_corrections
  ON events(user_id, user_modified, created_at DESC)
  WHERE user_modified = TRUE AND deleted_at IS NULL;

-- GIN index for JSONB correction history queries
CREATE INDEX idx_events_correction_history_gin
  ON events USING gin(correction_history jsonb_path_ops)
  WHERE correction_history IS NOT NULL;

-- Vector similarity search (IVFFlat index)
-- Wrapped in DO block to handle case where pgvector extension isn't enabled
DO $$
BEGIN
  -- Check if vector extension is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    -- Create IVFFlat index for fast similarity search
    CREATE INDEX IF NOT EXISTS idx_events_embedding
      ON events
      USING ivfflat (event_embedding vector_cosine_ops)
      WITH (lists = 100)
      WHERE event_embedding IS NOT NULL AND deleted_at IS NULL;
  ELSE
    RAISE NOTICE 'pgvector extension not found. Similarity search will work but may be slower without index.';
  END IF;
END $$;

-- ============================================================================
-- Sessions Table Updates
-- ============================================================================

-- Remove old JSONB event storage columns (if they exist)
ALTER TABLE sessions DROP COLUMN IF EXISTS calendar_events;
ALTER TABLE sessions DROP COLUMN IF EXISTS extracted_events;

-- Add simple event reference array
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS event_ids UUID[] NOT NULL DEFAULT '{}';

-- Index for event_ids array membership queries
CREATE INDEX IF NOT EXISTS idx_sessions_event_ids
  ON sessions USING gin(event_ids);

-- ============================================================================
-- Triggers for Auto-Computed Fields
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_events_updated_at();

-- Auto-compute time features (day_of_week, hour_of_day, duration_minutes)
CREATE OR REPLACE FUNCTION compute_event_time_features()
RETURNS TRIGGER AS $$
BEGIN
  -- Extract day of week and hour from start_time
  IF NEW.start_time IS NOT NULL THEN
    -- PostgreSQL: 0=Sunday, 6=Saturday. Convert to 0=Monday, 6=Sunday
    NEW.day_of_week = (EXTRACT(DOW FROM NEW.start_time)::INTEGER + 6) % 7;
    NEW.hour_of_day = EXTRACT(HOUR FROM NEW.start_time)::INTEGER;
  END IF;

  -- Compute duration in minutes
  IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    NEW.duration_minutes = EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time))::INTEGER / 60;
  ELSIF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL THEN
    NEW.duration_minutes = (NEW.end_date - NEW.start_date)::INTEGER * 1440;  -- days * minutes per day
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_compute_features
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION compute_event_time_features();

-- ============================================================================
-- Row-Level Security (RLS)
-- ============================================================================

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Users can only access their own events
CREATE POLICY "Users can view their own events"
  ON events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own events"
  ON events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own events"
  ON events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own events"
  ON events FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Helper Views
-- ============================================================================

-- Active events (not soft-deleted)
CREATE OR REPLACE VIEW active_events AS
SELECT * FROM events
WHERE deleted_at IS NULL;

-- DropCal drafts pending user review
CREATE OR REPLACE VIEW pending_drafts AS
SELECT * FROM events
WHERE provider = 'dropcal'
  AND is_draft = TRUE
  AND deleted_at IS NULL
ORDER BY created_at DESC;

-- Events confirmed but not yet synced to provider
CREATE OR REPLACE VIEW pending_sync AS
SELECT * FROM events
WHERE provider = 'dropcal'
  AND is_draft = FALSE
  AND provider_event_id IS NULL
  AND deleted_at IS NULL
ORDER BY created_at ASC;

-- Historical events for pattern learning (from providers, not DropCal)
CREATE OR REPLACE VIEW historical_events AS
SELECT * FROM events
WHERE provider != 'dropcal'
  AND deleted_at IS NULL
ORDER BY start_time DESC;

-- User corrections (events where user modified Agent 5 suggestions)
CREATE OR REPLACE VIEW user_corrections AS
SELECT
  id,
  user_id,
  summary,
  calendar_name,
  color_id,
  extracted_facts,
  system_suggestion,
  correction_history,
  event_embedding,
  created_at
FROM events
WHERE provider = 'dropcal'
  AND user_modified = TRUE
  AND deleted_at IS NULL
ORDER BY created_at DESC;

-- ============================================================================
-- Utility Functions
-- ============================================================================

-- Get events in time range for conflict detection
CREATE OR REPLACE FUNCTION get_conflicting_events(
  p_user_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  summary TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  calendar_name VARCHAR(255)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.summary,
    e.start_time,
    e.end_time,
    e.calendar_name
  FROM events e
  WHERE e.user_id = p_user_id
    AND e.deleted_at IS NULL
    AND e.is_all_day = FALSE
    AND (e.start_time, e.end_time) OVERLAPS (p_start_time, p_end_time);
END;
$$ LANGUAGE plpgsql;

-- Get session's events in extraction order
CREATE OR REPLACE FUNCTION get_session_events(p_session_id UUID)
RETURNS TABLE (
  id UUID,
  summary TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  is_draft BOOLEAN,
  calendar_name VARCHAR(255),
  color_id VARCHAR(10),
  extraction_order INTEGER
) AS $$
DECLARE
  v_event_ids UUID[];
BEGIN
  -- Get event IDs from session
  SELECT event_ids INTO v_event_ids
  FROM sessions
  WHERE id = p_session_id;

  -- Return events in array order
  RETURN QUERY
  SELECT
    e.id,
    e.summary,
    e.start_time,
    e.end_time,
    e.is_draft,
    e.calendar_name,
    e.color_id,
    array_position(v_event_ids, e.id) as extraction_order
  FROM events e
  WHERE e.id = ANY(v_event_ids)
  ORDER BY array_position(v_event_ids, e.id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE events IS 'Unified event storage - all events from all sources (Google, DropCal, etc.)';
COMMENT ON COLUMN events.provider IS 'Event source: dropcal (created here) or google/apple/microsoft (synced from provider)';
COMMENT ON COLUMN events.provider_account_id IS 'Provider account email (e.g., user@gmail.com). NULL for dropcal events.';
COMMENT ON COLUMN events.is_draft IS 'TRUE if user is reviewing, FALSE if confirmed. Only dropcal events can be drafts.';
COMMENT ON COLUMN events.system_suggestion IS 'Agent 5 original output before user edits (for learning from corrections)';
COMMENT ON COLUMN events.correction_history IS 'JSONB array of user edits: [{timestamp, field, old_value, new_value, change_type}]';
COMMENT ON COLUMN events.event_embedding IS '384-dim sentence-transformer embedding for semantic similarity search';
COMMENT ON COLUMN events.day_of_week IS 'Auto-computed: 0=Monday, 6=Sunday';
COMMENT ON COLUMN events.hour_of_day IS 'Auto-computed: 0-23';
COMMENT ON COLUMN events.duration_minutes IS 'Auto-computed: event duration in minutes';

COMMENT ON VIEW pending_drafts IS 'DropCal events awaiting user confirmation';
COMMENT ON VIEW pending_sync IS 'Confirmed DropCal events ready to sync to provider';
COMMENT ON VIEW historical_events IS 'Provider events for pattern learning (not created via DropCal)';
COMMENT ON VIEW user_corrections IS 'Events where user modified Agent 5 suggestions (feedback data)';

-- ============================================================================
-- Migration Cleanup (Optional - Run if migrating from old schema)
-- ============================================================================

-- Drop old event_corrections table if it exists
-- DROP TABLE IF EXISTS event_corrections CASCADE;

-- Drop old session_events junction table if it exists
-- DROP TABLE IF EXISTS session_events CASCADE;
