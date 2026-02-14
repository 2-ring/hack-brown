/**
 * Supabase authentication client for DropCal.
 * Handles OAuth sign-in (Google, Microsoft, Apple), sign-out, and session management.
 */

import { createClient } from '@supabase/supabase-js';
import type { Session, User } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// Create Supabase client with anon key (safe for frontend)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Sign in with Google OAuth.
 * Requests auth + calendar scopes so calendar is connected on sign-in.
 */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'email profile openid https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.settings.readonly',
      redirectTo: window.location.origin,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    console.error('Sign in error:', error);
    throw error;
  }

  return data;
}

/**
 * Sign in with Microsoft (Azure) OAuth.
 * Requests auth + calendar scopes so Outlook calendar is connected on sign-in.
 */
export async function signInWithMicrosoft() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email profile openid User.Read Calendars.ReadWrite offline_access',
      redirectTo: window.location.origin,
    },
  });

  if (error) {
    console.error('Sign in error:', error);
    throw error;
  }

  return data;
}

/**
 * Sign in with Apple OAuth.
 * Note: Apple Sign-In provides authentication only. Apple Calendar (CalDAV)
 * must be connected separately via Settings with an app-specific password.
 */
export async function signInWithApple() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: window.location.origin,
    },
  });

  if (error) {
    console.error('Sign in error:', error);
    throw error;
  }

  return data;
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Sign out error:', error);
    throw error;
  }
}

/**
 * Get the current session.
 * Returns null if no active session.
 */
export async function getSession(): Promise<Session | null> {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Get session error:', error);
    return null;
  }

  return session;
}

/**
 * Get the current user.
 * Returns null if no authenticated user.
 */
export async function getCurrentUser(): Promise<User | null> {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    console.error('Get user error:', error);
    return null;
  }

  return user;
}

/**
 * Get the current access token for API requests.
 * Returns null if no active session.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

/**
 * Subscribe to auth state changes.
 * Returns an unsubscribe function.
 *
 * Events: INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED
 */
export function onAuthStateChange(callback: (session: Session | null, event: string) => void) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session, event);
  });

  return () => subscription.unsubscribe();
}
