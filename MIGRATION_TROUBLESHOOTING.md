# Migration Troubleshooting Guide

## Issue: pgvector syntax error

**Error message:**
```
ERROR: 42601: syntax error at or near "USING"
```

### ✅ FIXED

The migration has been updated to:
1. Enable pgvector extension first
2. Wrap vector index creation in conditional DO block

### How to run the fixed migration:

```bash
# In Supabase SQL Editor, run:
backend/database/migrations/004_unified_events_table.sql
```

The migration will now:
- ✅ Enable pgvector extension automatically
- ✅ Create vector index if pgvector is available
- ✅ Gracefully skip vector index if pgvector isn't available (with warning)

---

## Common Issues & Solutions

### 1. "extension vector does not exist"

**Cause:** pgvector extension not installed in your Supabase instance

**Solution:** Enable pgvector in Supabase Dashboard
```
1. Go to Supabase Dashboard
2. Click "Database" → "Extensions"
3. Search for "vector"
4. Click "Enable" on pgvector
5. Re-run migration
```

**Alternative:** If pgvector isn't available, the migration will still work but similarity search will be slower (full table scan instead of index).

---

### 2. "table events already exists"

**Cause:** Migration ran partially before hitting error

**Solution:** Drop the table and re-run
```sql
-- CAREFUL: This deletes all events!
DROP TABLE IF EXISTS events CASCADE;

-- Then re-run full migration
```

**Better solution:** The migration uses `IF NOT EXISTS`, so you can just re-run it.

---

### 3. "column event_ids already exists"

**Cause:** sessions table was already updated

**Solution:** Migration handles this with `IF NOT EXISTS`, just re-run.

---

### 4. Vector index creation is slow

**Cause:** Building IVFFlat index on large table takes time

**Expected:**
- 0 events: instant
- 1,000 events: ~1 second
- 10,000 events: ~10 seconds
- 100,000 events: ~1-2 minutes

**Solution:** Be patient, or create index later:
```sql
-- Skip index creation initially, add it later
-- (Index creation is wrapped in DO block, can be run separately)

CREATE INDEX CONCURRENTLY idx_events_embedding
  ON events
  USING ivfflat (event_embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE event_embedding IS NOT NULL AND deleted_at IS NULL;
```

---

### 5. RLS policies blocking inserts

**Cause:** RLS enabled but auth.uid() doesn't match user_id

**Symptoms:**
- Events created from code fail
- "permission denied" errors

**Solution:** Two options:

**Option A:** Use service role key in backend (bypasses RLS)
```python
# backend already uses service role key, should work
```

**Option B:** Temporarily disable RLS for testing
```sql
-- ONLY FOR TESTING!
ALTER TABLE events DISABLE ROW LEVEL SECURITY;
```

---

### 6. Session.add_event() fails with "column event_ids does not exist"

**Cause:** Migration didn't run on sessions table

**Solution:** Manually add column:
```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS event_ids UUID[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_sessions_event_ids ON sessions USING gin(event_ids);
```

---

### 7. Embedding computation takes too long

**Cause:** sentence-transformers model loading is slow on first run

**Expected:**
- First embedding: ~5 seconds (model load)
- Subsequent: ~50ms each

**Solution:** Pre-load model:
```python
# In backend startup
from preferences.similarity import get_embedding_model
get_embedding_model()  # Loads model once
```

---

## Verification Checklist

After running migration, verify everything works:

```sql
-- 1. Check events table exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'events';
-- Expected: 1 row

-- 2. Check pgvector extension
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
-- Expected: vector | 0.5.0 (or similar)

-- 3. Check indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'events';
-- Expected: ~12 indexes including idx_events_embedding

-- 4. Check RLS policies
SELECT policyname FROM pg_policies WHERE tablename = 'events';
-- Expected: 4 policies (view, insert, update, delete)

-- 5. Check sessions updated
SELECT column_name FROM information_schema.columns
WHERE table_name = 'sessions' AND column_name = 'event_ids';
-- Expected: event_ids

-- 6. Check views created
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public' AND table_name LIKE '%events%';
-- Expected: active_events, pending_drafts, pending_sync, historical_events, user_corrections

-- 7. Check utility functions
SELECT proname FROM pg_proc WHERE proname IN ('get_conflicting_events', 'get_session_events');
-- Expected: 2 functions
```

---

## Success Indicators

✅ Migration successful if:
- events table created
- sessions.event_ids column added
- All indexes created (check pg_indexes)
- All views created (check pg_views)
- All RLS policies active (check pg_policies)
- Utility functions available (check pg_proc)

✅ System working if:
- Create test session → events created in events table
- Events have event_embedding populated
- Session has event_ids array populated
- Similarity search returns results
- No errors in backend logs

---

## Still Having Issues?

1. Check Supabase logs (Dashboard → Logs → Postgres Logs)
2. Check backend logs for errors
3. Verify pgvector is enabled in Supabase
4. Try running migration step-by-step (create table, then indexes, then views)
5. Check that you're using the latest migration file (with pgvector extension enabled)
