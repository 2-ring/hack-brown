/**
 * Supabase authentication client for DropCal.
 * Handles Google OAuth sign-in, sign-out, and session management.
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
 * Requests only authentication scopes (email, profile).
 * Calendar linking is handled separately.
 */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'email profile openid',
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
 */
export function onAuthStateChange(callback: (session: Session | null) => void) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return () => subscription.unsubscribe();
}
