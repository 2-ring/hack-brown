-- Migration: Add title field to sessions table
-- Run this in Supabase SQL Editor
-- Adds title field for storing generated session titles

-- Add title column to sessions table
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS title VARCHAR(100);

-- Add index for faster title searches
CREATE INDEX IF NOT EXISTS idx_sessions_title ON sessions(title);

-- Comment for documentation
COMMENT ON COLUMN sessions.title IS 'Generated title for the session (e.g., "MATH180 Syllabus", "Team Meeting")';
