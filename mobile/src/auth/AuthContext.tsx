/**
 * Authentication context for DropCal Mobile.
 * Provides user session, loading state, and auth actions across the app.
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
import { syncUserProfile } from '../api/backend-client';
import { toast } from '../components/Toast';

interface AuthContextType {
  /** Current Supabase session, null if not authenticated */
  session: Session | null;
  /** Current Supabase user, null if not authenticated */
  user: User | null;
  /** Whether auth state is being initialized */
  loading: boolean;
  /** Whether user is authenticated (convenience) */
  isAuthenticated: boolean;
  /** Sign in with Google OAuth */
  signIn: () => Promise<void>;
  /** Sign out current user */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Provider component that wraps the app and provides auth state.
 * Handles session initialization, auth state changes, and user profile syncing.
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

        // Sync user profile to backend (creates account if first time)
        try {
          const result = await syncUserProfile();

          if (result.is_new_user) {
            toast.success('Welcome to DropCal!', {
              description: 'Your account has been created successfully.',
              duration: 4000,
            });
          } else {
            toast.success('Welcome back!', {
              description: `Signed in as ${result.user.email}`,
              duration: 3000,
            });
          }

          console.log('User profile synced:', result.user);
        } catch (error) {
          console.error('Failed to sync user profile:', error);
          toast.error('Sync Failed', {
            description: 'Could not sync your profile. Please try again.',
            duration: 4000,
          });
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
      // Auth state change will be handled by the listener
    } catch (error) {
      console.error('Sign in failed:', error);

      if (error instanceof Error) {
        if (error.message.includes('cancel')) {
          toast.info('Sign In Cancelled', {
            description: 'You cancelled the sign-in process.',
            duration: 3000,
          });
        } else {
          toast.error('Sign In Failed', {
            description: error.message,
            duration: 4000,
          });
        }
      }

      throw error;
    }
  };

  const signOut = async () => {
    try {
      await authSignOut();
      setSession(null);
      setUser(null);

      toast.success('Signed Out', {
        description: 'You have been signed out successfully.',
        duration: 3000,
      });
    } catch (error) {
      console.error('Sign out failed:', error);

      toast.error('Sign Out Failed', {
        description: 'Could not sign out. Please try again.',
        duration: 4000,
      });

      throw error;
    }
  };

  const value: AuthContextType = {
    session,
    user,
    loading,
    isAuthenticated: session !== null,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context.
 * Must be used within an AuthProvider.
 *
 * @throws Error if used outside AuthProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, isAuthenticated, signIn, signOut } = useAuth();
 *
 *   if (!isAuthenticated) {
 *     return <Button onPress={signIn}>Sign In</Button>;
 *   }
 *
 *   return (
 *     <View>
 *       <Text>Welcome, {user?.email}</Text>
 *       <Button onPress={signOut}>Sign Out</Button>
 *     </View>
 *   );
 * }
 * ```
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
