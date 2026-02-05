# Unified Events Architecture

## Overview

**One `events` table for everything** - no more separate tables for historical events, drafts, corrections, etc.

## Event Lifecycle States

```
┌─────────────────────────────────────────────────────────────┐
│                     EVENT LIFECYCLE                          │
└─────────────────────────────────────────────────────────────┘

Historical Events (from Google Calendar):
  [Google Calendar] → [Fetch] → events(status='historical')
                                        ↓
                              Used for pattern learning


DropCal-Created Events:
  [User Input] → [Agent Pipeline] → events(status='draft')
                                           ↓
                            [User Reviews & Edits]
                                           ↓
                                  events(status='created')
                                           ↓
                              [Sync to Google Calendar]
                                           ↓
                          events(status='synced', google_event_id='...')


Deletion:
  Any event → events(deleted_at=NOW(), status='deleted')
```

## Status Field Values

| Status | dropcal_created | Description |
|--------|-----------------|-------------|
| `historical` | FALSE | Fetched from Google Calendar for pattern learning |
| `draft` | TRUE | Created via DropCal, user reviewing in UI |
| `created` | TRUE | User confirmed, ready to add to Google Calendar |
| `synced` | TRUE | Successfully synced to Google Calendar |
| `deleted` | ANY | Soft-deleted (user removed or sync detected deletion) |

## Schema Highlights

### Core Fields

```sql
-- Identity
id UUID PRIMARY KEY
user_id UUID  -- Owner

-- Source tracking
google_event_id VARCHAR(255)  -- NULL until synced
dropcal_created BOOLEAN       -- Origin flag
source_session_id UUID        -- Which session created this

-- Status
status VARCHAR(20)            -- Lifecycle state
```

### Event Data (Google Calendar Format)

```sql
-- Basic info
summary TEXT                  -- Title
description TEXT
location TEXT

-- Time (either start_time/end_time OR start_date/end_date)
start_time TIMESTAMPTZ
end_time TIMESTAMPTZ
start_date DATE
end_date DATE
is_all_day BOOLEAN

-- Metadata
calendar_name VARCHAR(255)    -- "Work", "Personal", etc.
color_id VARCHAR(10)          -- Google Calendar color
```

### DropCal Intelligence Fields

```sql
-- Extraction context
original_input TEXT           -- Raw user input
extracted_facts JSONB         -- Agent 2 output

-- Agent 5 tracking
system_suggestion JSONB       -- Original suggestion
user_modified BOOLEAN         -- Did user edit?
correction_history JSONB[]    -- Audit log of changes

-- ML features
event_embedding vector(384)   -- For similarity search
day_of_week INTEGER           -- Auto-computed
hour_of_day INTEGER           -- Auto-computed
duration_minutes INTEGER      -- Auto-computed
```

## Query Patterns

### 1. Get User's Draft Events (for UI)

```sql
SELECT * FROM events
WHERE user_id = $1
  AND status = 'draft'
  AND deleted_at IS NULL
ORDER BY created_at DESC;

-- OR use the view:
SELECT * FROM pending_drafts
WHERE user_id = $1;
```

### 2. Get Historical Events for Pattern Learning

```sql
SELECT * FROM events
WHERE user_id = $1
  AND status = 'historical'
  AND deleted_at IS NULL
  AND start_time > NOW() - INTERVAL '12 months'
ORDER BY start_time DESC
LIMIT 500;

-- OR use the view:
SELECT * FROM historical_events
WHERE user_id = $1
  AND start_time > NOW() - INTERVAL '12 months'
LIMIT 500;
```

### 3. Similarity Search (for Agent 5)

```sql
-- Find similar events using vector search
SELECT
  id,
  summary,
  calendar_name,
  color_id,
  start_time,
  1 - (event_embedding <=> $2::vector) as similarity
FROM events
WHERE user_id = $1
  AND event_embedding IS NOT NULL
  AND deleted_at IS NULL
ORDER BY event_embedding <=> $2::vector  -- Cosine distance
LIMIT 10;
```

### 4. Conflict Detection

```sql
-- Check if new event overlaps with existing events
SELECT * FROM events
WHERE user_id = $1
  AND deleted_at IS NULL
  AND status IN ('historical', 'synced', 'created')
  AND (
    -- Overlap detection
    (start_time, end_time) OVERLAPS ($2::timestamptz, $3::timestamptz)
  );
```

### 5. Get Events Needing Sync

```sql
SELECT * FROM events
WHERE user_id = $1
  AND status = 'created'
  AND google_event_id IS NULL
  AND deleted_at IS NULL;

-- OR use the view:
SELECT * FROM pending_sync
WHERE user_id = $1;
```

### 6. Get User Corrections (Feedback Loop)

```sql
SELECT
  id,
  summary,
  extracted_facts,
  system_suggestion,
  correction_history,
  event_embedding
FROM events
WHERE user_id = $1
  AND dropcal_created = TRUE
  AND user_modified = TRUE
  AND deleted_at IS NULL
ORDER BY created_at DESC;

-- OR use the view:
SELECT * FROM user_corrections
WHERE user_id = $1;
```

### 7. Get Session's Events

```sql
SELECT e.*
FROM events e
JOIN session_events se ON e.id = se.event_id
WHERE se.session_id = $1
ORDER BY se.order_index;
```

## How Sessions Work Now

**Before (old schema):**
```sql
CREATE TABLE sessions (
  id UUID,
  calendar_events JSONB,  -- ❌ Duplicated event data
  extracted_events JSONB  -- ❌ More duplication
);
```

**After (new schema):**
```sql
CREATE TABLE sessions (
  id UUID,
  event_count INTEGER  -- ✅ Just a count for display
);

-- Events live in the events table
-- Junction table connects them
CREATE TABLE session_events (
  session_id UUID,
  event_id UUID,
  order_index INTEGER,  -- Preserve extraction order
  PRIMARY KEY (session_id, event_id)
);
```

**Benefits:**
- ✅ No data duplication
- ✅ Events can be updated without touching sessions
- ✅ Sessions can reference same event (if user re-extracts)
- ✅ Easier to query all events across sessions

## Correction Tracking

### Old Approach (separate table):
```sql
CREATE TABLE event_corrections (
  id UUID,
  extracted_facts JSONB,
  system_suggestion JSONB,
  user_final JSONB,
  -- ... duplication
);
```

### New Approach (unified):
```sql
-- Correction data lives ON the event itself
CREATE TABLE events (
  system_suggestion JSONB,       -- What Agent 5 suggested
  user_modified BOOLEAN,          -- Did user change it?
  correction_history JSONB[],     -- Audit log
  -- Current state is the event columns (summary, time, etc.)
);
```

**Correction history format:**
```json
[
  {
    "timestamp": "2026-02-05T14:30:00Z",
    "field": "summary",
    "old_value": "CS Meeting",
    "new_value": "CS 101 Lecture",
    "change_type": "user_edit"
  },
  {
    "timestamp": "2026-02-05T14:31:00Z",
    "field": "start_time",
    "old_value": "2026-02-06T14:00:00Z",
    "new_value": "2026-02-06T15:00:00Z",
    "change_type": "user_edit"
  }
]
```

## Migration Path

### From old schema to new:

```sql
-- 1. Migrate historical events (if you had a separate cache table)
INSERT INTO events (
  user_id,
  google_event_id,
  google_calendar_id,
  dropcal_created,
  status,
  summary,
  description,
  location,
  start_time,
  end_time,
  calendar_name,
  color_id
)
SELECT
  user_id,
  google_event_id,
  google_calendar_id,
  FALSE,  -- Not created by DropCal
  'historical',
  summary,
  description,
  location,
  start_time,
  end_time,
  calendar_name,
  color_id
FROM old_calendar_events_table;

-- 2. Migrate event_corrections to events
INSERT INTO events (
  user_id,
  dropcal_created,
  status,
  source_session_id,
  summary,
  description,
  location,
  start_time,
  end_time,
  calendar_name,
  color_id,
  original_input,
  extracted_facts,
  system_suggestion,
  user_modified,
  event_embedding
)
SELECT
  user_id,
  TRUE,  -- Created via DropCal
  'synced',  -- Assume already synced
  session_id,
  (user_final->>'summary')::TEXT,
  (user_final->>'description')::TEXT,
  (user_final->>'location')::TEXT,
  (user_final->'start'->>'dateTime')::TIMESTAMPTZ,
  (user_final->'end'->>'dateTime')::TIMESTAMPTZ,
  (user_final->>'calendar')::TEXT,
  (user_final->>'colorId')::TEXT,
  original_input,
  extracted_facts,
  system_suggestion,
  TRUE,  -- User modified (it's a correction!)
  facts_embedding
FROM event_corrections;

-- 3. Drop old tables
DROP TABLE IF EXISTS event_corrections;
DROP TABLE IF EXISTS old_calendar_events_table;
```

## Performance Characteristics

### Indexes Created:

| Index | Purpose | Query Speedup |
|-------|---------|---------------|
| `idx_events_user_id` | User's events | O(log n) lookup |
| `idx_events_time_range` | Conflict detection | Range scan |
| `idx_events_embedding` | Similarity search | Vector ANN search |
| `idx_events_historical` | Pattern learning | Filtered scan |
| `idx_events_status` | Lifecycle queries | Fast status filtering |

### Expected Performance:

| Query | Without Index | With Index | Improvement |
|-------|--------------|------------|-------------|
| Get user's events | O(n) scan | O(log n) | 100-1000x |
| Conflict detection | O(n) scan | O(log n) | 100-1000x |
| Similarity search | O(n) brute force | O(log n) ANN | 1000-10000x |
| Pattern discovery | O(n) scan | O(k) filtered | 10-100x |

### Storage Estimates:

| Field Type | Size per Event | 1000 Events | 10000 Events |
|------------|---------------|-------------|--------------|
| Text data | 0.5 KB | 0.5 MB | 5 MB |
| Vector embedding | 1.5 KB | 1.5 MB | 15 MB |
| JSONB fields | 1.0 KB | 1.0 MB | 10 MB |
| **Total** | **3 KB** | **3 MB** | **30 MB** |

**Per user:** ~5-20 MB for 2-10 years of history

## Benefits of Unified Model

### 1. **No Data Duplication**
- Sessions reference events, don't copy them
- Corrections are fields on events, not separate rows
- Single source of truth

### 2. **Simpler Queries**
```sql
-- Before: Join 3 tables
SELECT * FROM sessions s
JOIN extracted_events ee ON s.id = ee.session_id
JOIN event_corrections ec ON ee.id = ec.event_id;

-- After: Just query events
SELECT * FROM events WHERE user_id = $1;
```

### 3. **Efficient Updates**
```sql
-- Before: Update in multiple places
UPDATE sessions SET calendar_events = jsonb_set(...);
UPDATE event_corrections SET user_final = jsonb_set(...);

-- After: Single update
UPDATE events SET summary = $1, user_modified = TRUE WHERE id = $2;
```

### 4. **Better Analytics**
```sql
-- How many events did user create in last month?
SELECT COUNT(*) FROM events
WHERE user_id = $1
  AND dropcal_created = TRUE
  AND created_at > NOW() - INTERVAL '1 month';

-- What's the user's favorite calendar?
SELECT calendar_name, COUNT(*) as count
FROM events
WHERE user_id = $1
GROUP BY calendar_name
ORDER BY count DESC
LIMIT 1;

-- When does user schedule most meetings?
SELECT hour_of_day, COUNT(*) as count
FROM events
WHERE user_id = $1
  AND summary ILIKE '%meeting%'
GROUP BY hour_of_day
ORDER BY count DESC;
```

### 5. **Atomic Operations**
```sql
-- Create draft event + link to session in one transaction
BEGIN;
  INSERT INTO events (...) RETURNING id;
  INSERT INTO session_events (session_id, event_id, order_index) VALUES (...);
  UPDATE sessions SET event_count = event_count + 1 WHERE id = $1;
COMMIT;
```

## API Service Layer Example

```python
# backend/events/service.py

class EventService:
    """Unified event management service"""

    def create_draft_event(
        self,
        user_id: str,
        session_id: str,
        extracted_facts: dict,
        system_suggestion: dict,
        order_index: int
    ) -> Event:
        """Create a new draft event from extraction pipeline"""

        event = db.execute("""
            INSERT INTO events (
                user_id,
                dropcal_created,
                status,
                source_session_id,
                summary,
                start_time,
                end_time,
                location,
                calendar_name,
                color_id,
                extracted_facts,
                system_suggestion
            ) VALUES ($1, TRUE, 'draft', $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        """, [
            user_id,
            session_id,
            system_suggestion['summary'],
            system_suggestion['start']['dateTime'],
            system_suggestion['end']['dateTime'],
            system_suggestion.get('location'),
            system_suggestion.get('calendar'),
            system_suggestion.get('colorId'),
            json.dumps(extracted_facts),
            json.dumps(system_suggestion)
        ]).fetchone()

        # Link to session
        db.execute("""
            INSERT INTO session_events (session_id, event_id, order_index)
            VALUES ($1, $2, $3)
        """, [session_id, event['id'], order_index])

        return event

    def get_historical_events(
        self,
        user_id: str,
        limit: int = 500
    ) -> List[Event]:
        """Get historical events for pattern learning"""

        return db.execute("""
            SELECT * FROM historical_events
            WHERE user_id = $1
            LIMIT $2
        """, [user_id, limit]).fetchall()

    def find_similar_events(
        self,
        user_id: str,
        query_embedding: np.ndarray,
        k: int = 10
    ) -> List[Tuple[Event, float]]:
        """Find similar events using vector search"""

        results = db.execute("""
            SELECT
                *,
                1 - (event_embedding <=> $2::vector) as similarity
            FROM events
            WHERE user_id = $1
              AND event_embedding IS NOT NULL
              AND deleted_at IS NULL
            ORDER BY event_embedding <=> $2::vector
            LIMIT $3
        """, [user_id, query_embedding.tolist(), k]).fetchall()

        return [(row, row['similarity']) for row in results]

    def confirm_draft(
        self,
        user_id: str,
        event_id: str,
        user_edits: dict = None
    ) -> Event:
        """User confirms draft, apply edits, mark as created"""

        if user_edits:
            # User made changes - track correction
            db.execute("""
                UPDATE events
                SET
                    summary = COALESCE($3, summary),
                    start_time = COALESCE($4, start_time),
                    end_time = COALESCE($5, end_time),
                    calendar_name = COALESCE($6, calendar_name),
                    color_id = COALESCE($7, color_id),
                    user_modified = TRUE,
                    correction_history = array_append(
                        correction_history,
                        jsonb_build_object(
                            'timestamp', NOW(),
                            'changes', $8::jsonb
                        )
                    ),
                    status = 'created'
                WHERE user_id = $1 AND id = $2
                RETURNING *
            """, [user_id, event_id, user_edits.get('summary'), ...])
        else:
            # No changes - just mark as created
            db.execute("""
                UPDATE events
                SET status = 'created'
                WHERE user_id = $1 AND id = $2
                RETURNING *
            """, [user_id, event_id])

        return event

    def sync_to_google_calendar(
        self,
        user_id: str,
        event_id: str
    ) -> Event:
        """Sync created event to Google Calendar"""

        event = self.get_event(user_id, event_id)

        # Create in Google Calendar
        google_event = google_calendar_api.create_event({
            'summary': event['summary'],
            'start': {'dateTime': event['start_time'].isoformat()},
            'end': {'dateTime': event['end_time'].isoformat()},
            # ... other fields
        })

        # Update event with Google ID
        db.execute("""
            UPDATE events
            SET
                google_event_id = $3,
                google_calendar_id = $4,
                status = 'synced',
                last_synced_at = NOW()
            WHERE user_id = $1 AND id = $2
            RETURNING *
        """, [user_id, event_id, google_event['id'], google_event['calendarId']])

        return event
```

## Summary

**Before:** Fragmented data across sessions, corrections, historical events

**After:** Single unified `events` table with clear lifecycle states

**Result:**
- ✅ Cleaner code
- ✅ Faster queries
- ✅ No duplication
- ✅ Better analytics
- ✅ Simpler reasoning
- ✅ Easier to extend
