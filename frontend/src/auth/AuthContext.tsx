/**
 * Authentication context for managing auth state across the application.
 * Provides user session, loading state, and auth actions.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  getSession,
  getCurrentUser,
  signInWithGoogle,
  signOut as authSignOut,
  onAuthStateChange,
} from './supabase';
import { storeGoogleCalendarTokens } from '../api/backend-client';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
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

  useEffect(() => {
    // Initialize session on mount
    const initializeAuth = async () => {
      try {
        const currentSession = await getSession();
        setSession(currentSession);

        if (currentSession) {
          const currentUser = await getCurrentUser();
          setUser(currentUser);
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChange(async (newSession) => {
      setSession(newSession);

      if (newSession) {
        const currentUser = await getCurrentUser();
        setUser(currentUser);

        // Store Google Calendar tokens if available
        // This happens after successful Google OAuth sign-in
        if (newSession.provider_token) {
          try {
            await storeGoogleCalendarTokens(newSession.provider_token);
            console.log('Google Calendar tokens stored successfully');
          } catch (error) {
            console.error('Failed to store Google Calendar tokens:', error);
          }
        }
      } else {
        setUser(null);
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
