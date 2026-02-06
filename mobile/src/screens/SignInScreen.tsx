/**
 * SignInScreen - Authentication screen
 * Clean, minimal sign-in with Google, Microsoft, and Apple options
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  Image,
} from 'react-native';
import { useTheme } from '../theme';
import { Logo } from '../components';
import { useAuth } from '../auth';

export function SignInScreen() {
  const { theme } = useTheme();
  const { signIn, loading } = useAuth();

  const handleGoogleSignIn = async () => {
    try {
      await signIn();
    } catch (error) {
      console.error('Google sign in failed:', error);
    }
  };

  const handleMicrosoftSignIn = async () => {
    // TODO: Implement Microsoft sign-in
    console.log('Microsoft sign-in not yet implemented');
  };

  const handleAppleSignIn = async () => {
    // TODO: Implement Apple sign-in
    console.log('Apple sign-in not yet implemented');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        {/* Logo at top center */}
        <View style={styles.logoContainer}>
          <Logo size={60} />
        </View>

        {/* Display text - matching web welcome page */}
        <Text style={[styles.heroText, { color: theme.colors.primary }]}>
          Drop anything in.{'\n'}Get events out.
        </Text>

        {/* Sign-in buttons */}
        <View style={styles.buttonContainer}>
          <Pressable
            style={styles.signInButton}
            onPress={handleGoogleSignIn}
            disabled={loading}
          >
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.buttonText}>Sign in with Google</Text>
          </Pressable>

          <Pressable
            style={styles.signInButton}
            onPress={handleMicrosoftSignIn}
            disabled={loading}
          >
            <Text style={styles.microsoftIcon}>⊞</Text>
            <Text style={styles.buttonText}>Sign in with Microsoft</Text>
          </Pressable>

          <Pressable
            style={styles.signInButton}
            onPress={handleAppleSignIn}
            disabled={loading}
          >
            <Text style={styles.appleIcon}></Text>
            <Text style={styles.buttonText}>Sign in with Apple</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 60,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  heroText: {
    fontFamily: 'Chillax-Bold',
    fontSize: 50,
    fontWeight: '700',
    lineHeight: 50,
    textAlign: 'center',
    letterSpacing: -1,
    marginBottom: 60,
    textShadowColor: 'rgba(17, 112, 197, 0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 320,
    gap: 16,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2b2b2b',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 32,
    gap: 16,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '500',
  },
  googleIcon: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  microsoftIcon: {
    fontSize: 24,
    fontWeight: '400',
    color: '#ffffff',
  },
  appleIcon: {
    fontSize: 24,
    fontWeight: '400',
    color: '#ffffff',
  },
});
