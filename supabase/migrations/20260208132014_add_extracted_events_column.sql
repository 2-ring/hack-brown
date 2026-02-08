-- Add extracted_events column to sessions table for Agent 1 output storage
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS extracted_events JSONB;
