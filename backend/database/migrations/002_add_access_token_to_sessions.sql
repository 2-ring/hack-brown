-- Migration: Add access_token column to sessions table
-- Date: 2026-02-05
-- Description: Adds access_token field for secure guest session access control
-- This prevents session hijacking by requiring token verification on guest session reads

-- Add access_token column (nullable for backward compatibility with existing sessions)
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS access_token VARCHAR(64);

-- Add index for token lookups (speeds up verification queries)
CREATE INDEX IF NOT EXISTS idx_sessions_access_token ON sessions(access_token) WHERE access_token IS NOT NULL;

-- Add comment
COMMENT ON COLUMN sessions.access_token IS 'Secure random token for guest session access verification (64-char hex)';
