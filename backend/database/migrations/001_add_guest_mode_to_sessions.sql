-- Migration: Add guest_mode column to sessions table
-- Date: 2026-02-05
-- Description: Adds guest_mode boolean field to support guest sessions without authentication

-- Add guest_mode column
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS guest_mode BOOLEAN DEFAULT FALSE NOT NULL;

-- Add index for querying guest sessions
CREATE INDEX IF NOT EXISTS idx_sessions_guest_mode ON sessions(guest_mode);

-- Add comment
COMMENT ON COLUMN sessions.guest_mode IS 'Whether this session was created by a guest user (no authentication)';
