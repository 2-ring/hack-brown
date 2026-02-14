/**
 * Authentication context for managing auth state across the application.
 * Provides user session, loading state, and auth actions.
 *
 * Design: User identity (user/session) is set immediately on load.
 * Calendar token storage is a fire-and-forget side effect of sign-in.
 * Calendar operations independently handle missing tokens via the backend.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import posthog from 'posthog-js';
import {
  getSession,
  getCurrentUser,
  signInWithGoogle,
  signOut as authSignOut,
  onAuthStateChange,
} from './supabase';
import { syncUserProfile, getUserProfile, storeGoogleCalendarTokens } from '../api/backend-client';
import { sessionCache } from '../sessions/cache';
import { GuestSessionManager } from './GuestSessionManager';

export interface UserPreferences {
  theme_mode?: 'light' | 'dark';
  date_format?: 'MM/DD/YYYY' | 'DD/MM/YYYY';
  timezone?: string;
  autoAddEvents?: boolean;
  conflictBehavior?: 'warn' | 'skip' | 'add';
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  calendarReady: boolean;
  preferences: UserPreferences;
  setPreferences: React.Dispatch<React.SetStateAction<UserPreferences>>;
  primaryCalendarProvider: string | null;
  setPrimaryCalendarProviderLocal: (provider: string | null) => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Provider component that wraps the app and provides auth state.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<UserPreferences>({});
  const [primaryCalendarProvider, setPrimaryCalendarProvider] = useState<string | null>(null);
  const [calendarReady, setCalendarReady] = useState(false);

  // Guard against duplicate token storage when Supabase fires both
  // INITIAL_SESSION and SIGNED_IN during the same OAuth redirect
  const syncInitiatedRef = React.useRef(false);

  useEffect(() => {
    // Initialize session on mount — always set user immediately
    const initializeAuth = async () => {
      try {
        const currentSession = await getSession();
        setSession(currentSession);

        if (currentSession) {
          const currentUser = await getCurrentUser();
          setUser(currentUser);

          if (currentUser) {
            posthog.identify(currentUser.id, {
              email: currentUser.email,
              name: currentUser.user_metadata?.full_name,
            });
          }

          try {
            const profile = await getUserProfile();
            if (profile.user?.preferences) {
              setPreferences(profile.user.preferences);
            }
            if (profile.user?.primary_calendar_provider) {
              setPrimaryCalendarProvider(profile.user.primary_calendar_provider);
            }
          } catch {
            // Preferences will use defaults
          }

          // Only mark calendar ready if this is a genuine session restore (no
          // provider_token). If provider_token is present, this is an OAuth
          // redirect — tokens still need storing, so let onAuthStateChange do it.
          if (!currentSession.provider_token) {
            setCalendarReady(true);
          }
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChange(async (newSession, event) => {
      setSession(newSession);

      if (newSession) {
        const currentUser = await getCurrentUser();

        // Always set user immediately — never block on token storage
        setUser(currentUser);

        if (currentUser) {
          posthog.identify(currentUser.id, {
            email: currentUser.email,
            name: currentUser.user_metadata?.full_name,
          });
        }

        // Profile sync + calendar token storage happen in the background.
        // Trigger on SIGNED_IN (normal sign-in) or INITIAL_SESSION with
        // provider_token (OAuth redirect where SIGNED_IN fires before listener).
        const hasProviderToken = !!newSession.provider_token;
        const shouldSync = event === 'SIGNED_IN' ||
          (event === 'INITIAL_SESSION' && hasProviderToken);

        if (shouldSync && !syncInitiatedRef.current) {
          syncInitiatedRef.current = true;
          // Background: sync profile, store tokens, load preferences
          (async () => {
            try {
              const result = await syncUserProfile();
              console.log(result.is_new_user ? 'Account created successfully' : 'Welcome back');

              const profile = await getUserProfile();
              if (profile.user?.preferences) {
                setPreferences(profile.user.preferences);
              }
              if (profile.user?.primary_calendar_provider) {
                setPrimaryCalendarProvider(profile.user.primary_calendar_provider);
              }
            } catch (error) {
              console.error('Failed to sync user profile:', error);
            }

            // Store Google Calendar tokens if present (only after OAuth redirect)
            if (hasProviderToken) {
              try {
                await storeGoogleCalendarTokens({
                  access_token: newSession.provider_token!,
                  refresh_token: newSession.provider_refresh_token || undefined,
                });
                console.log('Google Calendar tokens stored successfully');
              } catch (error) {
                console.error('Failed to store Google Calendar tokens:', error);
              }
            }

            // Signal that calendar tokens are now stored and ready
            setCalendarReady(true);
          })();
        } else if (!syncInitiatedRef.current) {
          // No token storage needed (session restore via listener) — already ready.
          // Only set calendarReady if no background sync is in-flight. When
          // syncInitiatedRef is true, the background async above will set
          // calendarReady once token storage completes — don't race it.
          setCalendarReady(true);
        }
      } else {
        setUser(null);
        setPreferences({});
        setPrimaryCalendarProvider(null);
        setCalendarReady(false);
        syncInitiatedRef.current = false;

        // Reset PostHog identity on sign-out
        posthog.reset();
      }

      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const signIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign in failed:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      // 1. Sign out from Supabase (clears JWT from storage)
      await authSignOut();

      // 2. Clear all local auth state
      setSession(null);
      setUser(null);
      setPreferences({});
      setPrimaryCalendarProvider(null);
      setCalendarReady(false);

      // 3. Reset analytics identity
      posthog.reset();

      // 4. Clear session cache (in-memory + localStorage)
      sessionCache.clear();

      // 5. Clear guest session data
      GuestSessionManager.clearGuestSessions();
      localStorage.removeItem('dropcal_guest_toast_dismissed');

      // 6. Hard reload to wipe all in-memory state
      window.location.replace('/');
    } catch (error) {
      console.error('Sign out failed:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    session,
    user,
    loading,
    calendarReady,
    preferences,
    setPreferences,
    primaryCalendarProvider,
    setPrimaryCalendarProviderLocal: setPrimaryCalendarProvider,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context.
 * Must be used within an AuthProvider.
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
