-- Add timezone column to users table
-- The application code reads/writes timezone as a top-level column,
-- but it was previously only defined inside the preferences JSONB.

ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'America/New_York';

-- Backfill from preferences JSONB where available
UPDATE users
SET timezone = preferences->>'timezone'
WHERE preferences->>'timezone' IS NOT NULL
  AND timezone = 'America/New_York';
