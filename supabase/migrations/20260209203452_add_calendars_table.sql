-- Create calendars table for storing user calendar metadata and AI descriptions
CREATE TABLE IF NOT EXISTS calendars (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID NOT NULL,
    provider          TEXT NOT NULL DEFAULT 'google',
    provider_cal_id   TEXT NOT NULL,

    -- Provider metadata
    name              TEXT NOT NULL,
    color             TEXT,
    foreground_color  TEXT,
    is_primary        BOOLEAN NOT NULL DEFAULT FALSE,

    -- AI-generated fields (populated by pattern discovery/refresh)
    description       TEXT,
    event_types       JSONB DEFAULT '[]'::JSONB,
    examples          JSONB DEFAULT '[]'::JSONB,
    never_contains    JSONB DEFAULT '[]'::JSONB,

    -- Refresh tracking
    events_analyzed   INTEGER DEFAULT 0,
    last_refreshed    TIMESTAMPTZ,

    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, provider_cal_id)
);

CREATE INDEX IF NOT EXISTS idx_calendars_user_id ON calendars(user_id);
