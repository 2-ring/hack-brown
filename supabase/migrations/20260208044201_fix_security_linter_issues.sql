-- Migration: Fix Supabase Linter Security Issues
-- Fixes: security_definer_view, rls_disabled_in_public, sensitive_columns_exposed,
--        function_search_path_mutable, extension_in_public

-- ============================================================================
-- 1. Enable RLS on unprotected tables + add policies
-- ============================================================================

-- users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- sessions table
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sessions"
  ON public.sessions FOR SELECT
  USING (auth.uid() = user_id OR guest_mode = true);

CREATE POLICY "Users can insert their own sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id OR guest_mode = true);

CREATE POLICY "Users can update their own sessions"
  ON public.sessions FOR UPDATE
  USING (auth.uid() = user_id OR (guest_mode = true AND access_token IS NOT NULL))
  WITH CHECK (auth.uid() = user_id OR (guest_mode = true AND access_token IS NOT NULL));

CREATE POLICY "Users can delete their own sessions"
  ON public.sessions FOR DELETE
  USING (auth.uid() = user_id);

-- event_corrections table
ALTER TABLE public.event_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own corrections"
  ON public.event_corrections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own corrections"
  ON public.event_corrections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 2. Fix SECURITY DEFINER views by setting security_invoker = true
-- ============================================================================

ALTER VIEW public.active_events SET (security_invoker = on);
ALTER VIEW public.pending_sync SET (security_invoker = on);
ALTER VIEW public.historical_events SET (security_invoker = on);
ALTER VIEW public.user_corrections SET (security_invoker = on);
ALTER VIEW public.pending_drafts SET (security_invoker = on);

-- ============================================================================
-- 3. Fix function search_path mutable
-- ============================================================================

ALTER FUNCTION public.update_updated_at_column()
  SET search_path = public;

ALTER FUNCTION public.update_events_updated_at()
  SET search_path = public;

ALTER FUNCTION public.compute_event_time_features()
  SET search_path = public;

ALTER FUNCTION public.get_session_events(uuid)
  SET search_path = public;

ALTER FUNCTION public.get_conflicting_events(uuid, timestamptz, timestamptz)
  SET search_path = public;

-- ============================================================================
-- 4. Move vector extension out of public schema
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;
