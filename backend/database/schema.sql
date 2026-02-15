-- DropCal Database Schema for Supabase
-- Run this in Supabase SQL Editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users/Accounts table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  google_id VARCHAR(255) UNIQUE,
  display_name VARCHAR(255),
  photo_url TEXT,

  -- Google Calendar API tokens (will be encrypted in app)
  google_access_token TEXT,
  google_refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,

  -- User timezone
  timezone VARCHAR(100) DEFAULT 'America/New_York',

  -- User preferences (JSONB for flexibility)
  preferences JSONB DEFAULT '{
    "defaultCalendarId": null,
    "timezone": "America/New_York",
    "autoAddEvents": false,
    "conflictBehavior": "warn"
  }'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Input data
  input_type VARCHAR(50) NOT NULL CHECK (input_type IN ('text', 'image', 'audio', 'email', 'pdf')),
  input_content TEXT NOT NULL, -- Original text or file path

  -- Processing results (JSONB for flexibility)
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'error')),
  extracted_events JSONB DEFAULT '[]'::jsonb,
  processed_events JSONB DEFAULT '[]'::jsonb,
  conflicts JSONB DEFAULT '[]'::jsonb,

  -- Metadata
  added_to_calendar BOOLEAN DEFAULT FALSE,
  calendar_event_ids TEXT[], -- Array of Google Calendar event IDs
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
