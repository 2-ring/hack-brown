-- Migration: Fix guest sessions + secure events table
-- Problem: events.user_id FK to users(id) blocks guest event creation
--          (guests use random UUIDs not in users table).
-- Also ensures RLS is enabled with correct policies.

-- ============================================================================
-- 1. Drop FK constraint so guest sessions can create events
-- ============================================================================

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_user_id_fkey;

-- ============================================================================
-- 2. Enable RLS on events table + add policies (idempotent)
-- ============================================================================

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to make this idempotent
DROP POLICY IF EXISTS "Users can view their own events" ON public.events;
DROP POLICY IF EXISTS "Users can insert their own events" ON public.events;
DROP POLICY IF EXISTS "Users can update their own events" ON public.events;
DROP POLICY IF EXISTS "Users can delete their own events" ON public.events;

CREATE POLICY "Users can view their own events"
  ON public.events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own events"
  ON public.events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own events"
  ON public.events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own events"
  ON public.events FOR DELETE
  USING (auth.uid() = user_id);

-- Note: Guest event operations go through the backend API which uses the
-- service role key (bypasses RLS). Guests don't access Supabase directly.