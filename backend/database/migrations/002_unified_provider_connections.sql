-- Migration: Unified provider connections architecture
-- Run this in Supabase SQL Editor
-- Replaces separate auth_providers and calendar_connections with unified structure

-- Add unified provider_connections column
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_connections JSONB DEFAULT '[]'::jsonb;

-- Add primary provider pointers
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_auth_provider VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_calendar_provider VARCHAR(50);

-- Create index for faster provider lookups
CREATE INDEX IF NOT EXISTS idx_users_provider_connections ON users USING gin(provider_connections);

-- Comment for documentation
COMMENT ON COLUMN users.provider_connections IS 'Unified list of connected accounts: [{provider: "google", provider_id: "123", email: "...", usage: ["auth", "calendar"], linked_at: "..."}]';
COMMENT ON COLUMN users.primary_auth_provider IS 'Which provider is used for authentication (e.g., "google")';
COMMENT ON COLUMN users.primary_calendar_provider IS 'Which provider is actively used for calendar events (e.g., "google", "apple_calendar")';

-- Note: Keep auth_providers, calendar_connections, google_id, google_access_token for backward compatibility
-- Can migrate data from old structure to new and deprecate later
