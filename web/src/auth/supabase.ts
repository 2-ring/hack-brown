/**
 * Supabase authentication client for DropCal.
 * Handles OAuth sign-in (Google, Microsoft, Apple), sign-out, and session management.
 */

import { createClient } from '@supabase/supabase-js';
import type { Session, User } from '@supabase/supabase-js';
import { isNativePlatform } from '../utils/platform';
import { Browser } from '@capacitor/browser';
import { App as CapApp } from '@capacitor/app';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// Create Supabase client with anon key (safe for frontend)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * On native platforms, open OAuth in the system browser and handle the
 * redirect back to the app via deep link. The deep link URL contains
 * the access_token and refresh_token as hash fragments.
 */
async function signInWithOAuthNative(
  provider: 'google' | 'azure' | 'apple',
  scopes?: string,
  queryParams?: Record<string, string>,
) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      scopes,
      redirectTo: 'dropcal://auth/callback',
      queryParams,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    console.error('Sign in error:', error);
    throw error;
  }

  if (data.url) {
    // Open OAuth page in the system browser
    await Browser.open({ url: data.url });

    // Listen for the deep link callback
    const handleUrl = async ({ url }: { url: string }) => {
      if (url.startsWith('dropcal://auth/callback')) {
        await Browser.close();

        // Extract tokens from the URL hash fragment
        // Supabase returns: dropcal://auth/callback#access_token=...&refresh_token=...
        const hashParams = new URLSearchParams(url.split('#')[1] || '');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      }
    };

    CapApp.addListener('appUrlOpen', handleUrl);
  }

  return data;
}

/**
 * Sign in with Google OAuth.
 * Requests auth + calendar scopes so calendar is connected on sign-in.
 */
export async function signInWithGoogle() {
  if (isNativePlatform()) {
    return signInWithOAuthNative(
      'google',
      'email profile openid https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.settings.readonly',
      { access_type: 'offline', prompt: 'consent' },
    );
  }

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
  if (isNativePlatform()) {
    return signInWithOAuthNative(
      'azure',
      'email profile openid User.Read Calendars.ReadWrite offline_access',
    );
  }

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
  if (isNativePlatform()) {
    return signInWithOAuthNative('apple');
  }

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
