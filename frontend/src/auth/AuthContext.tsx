/**
 * Authentication context for managing auth state across the application.
 * Provides user session, loading state, and auth actions.
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

  useEffect(() => {
    // Initialize session on mount
    const initializeAuth = async () => {
      try {
        const currentSession = await getSession();
        setSession(currentSession);

        if (currentSession) {
          const currentUser = await getCurrentUser();
          setUser(currentUser);

          // Identify returning user in PostHog
          if (currentUser) {
            posthog.identify(currentUser.id, {
              email: currentUser.email,
              name: currentUser.user_metadata?.full_name,
            });
          }

          // Fetch preferences from backend profile
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
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Subscribe to auth state changes
    // Only run expensive sync operations on SIGNED_IN (actual login, not session restore)
    const unsubscribe = onAuthStateChange(async (newSession, event) => {
      setSession(newSession);

      if (newSession) {
        const currentUser = await getCurrentUser();

        // Only sync profile and store tokens on actual sign-in (not session restore or token refresh)
        if (event === 'SIGNED_IN') {
          try {
            const result = await syncUserProfile();
            console.log(result.is_new_user ? 'Account created successfully' : 'Welcome back');
            console.log('User profile synced:', result.user);

            // Fetch full profile to get preferences
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

          // If provider_token exists, send Google Calendar tokens to backend
          // This is present after OAuth redirect when calendar scopes were requested
          if (newSession.provider_token) {
            try {
              await storeGoogleCalendarTokens({
                access_token: newSession.provider_token,
                refresh_token: newSession.provider_refresh_token || undefined,
              });
              console.log('Google Calendar tokens stored successfully');
            } catch (error) {
              console.error('Failed to store Google Calendar tokens:', error);
            }
          }

          // Set user AFTER profile sync and token storage complete
          // so App.tsx syncCalendar() doesn't fire before tokens exist
          setUser(currentUser);

          // Identify user in PostHog for analytics attribution
          if (currentUser) {
            posthog.identify(currentUser.id, {
              email: currentUser.email,
              name: currentUser.user_metadata?.full_name,
            });
          }
        } else {
          setUser(currentUser);
        }
      } else {
        setUser(null);
        setPreferences({});
        setPrimaryCalendarProvider(null);

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
      await authSignOut();
      setSession(null);
      setUser(null);
    } catch (error) {
      console.error('Sign out failed:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    session,
    user,
    loading,
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
