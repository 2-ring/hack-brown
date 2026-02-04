-- Migration: Add multi-provider calendar token storage
-- Date: 2026-02-04
-- Description: Adds token columns for Microsoft Outlook and Apple Calendar

-- Add Microsoft OAuth token columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_token_expires_at TIMESTAMPTZ;

-- Add Apple CalDAV credential columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_app_password TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_id VARCHAR(255);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_primary_calendar_provider ON users(primary_calendar_provider);
CREATE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_id);

-- Add comments for documentation
COMMENT ON COLUMN users.microsoft_access_token IS 'Encrypted Microsoft Graph API access token';
COMMENT ON COLUMN users.microsoft_refresh_token IS 'Encrypted Microsoft Graph API refresh token';
COMMENT ON COLUMN users.microsoft_token_expires_at IS 'Expiration timestamp for Microsoft access token';
COMMENT ON COLUMN users.apple_app_password IS 'Encrypted Apple iCloud app-specific password for CalDAV access';
COMMENT ON COLUMN users.apple_id IS 'Apple ID email address for CalDAV authentication';
