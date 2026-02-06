import React from 'react';
import { View, StyleSheet, Pressable, Text, Linking, Alert, Animated } from 'react-native';
import { Icon } from '../../components/Icon';
import { useTheme } from '../../theme';

export interface EmailInputScreenProps {
  /** Close handler */
  onClose: () => void;
  /** Optional user email (from auth context if available) */
  userEmail?: string;
}

/**
 * Email Input Screen - Dock Layout (1:1 Web Conversion)
 * 100px border-radius pill with horizontal layout
 */
export function EmailInputScreen({ onClose, userEmail }: EmailInputScreenProps) {
  const { theme } = useTheme();

  // Extract username from email (part before @)
  // Fallback to a random guest identifier if no user
  const username =
    userEmail?.split('@')[0] ||
    `guest${Math.random().toString(36).substring(2, 8)}`;
  const dropCalEmail = `${username}@events.dropcal.ai`;

  const handleEmailClick = async () => {
    const mailtoUrl = `mailto:${dropCalEmail}`;

    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);

      if (canOpen) {
        await Linking.openURL(mailtoUrl);
      } else {
        Alert.alert(
          'Email Client Not Available',
          'Please configure an email client on your device to use this feature.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error opening email client:', error);
      Alert.alert(
        'Error',
        'Could not open email client. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
      {/* Backdrop overlay */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
      />

      {/* Input Container - Centered */}
      <View style={styles.inputContainer}>
        {/* Close Button - Outside dock (left of dock) */}
        <Animated.View style={styles.externalButtonWrapper}>
          <Pressable
            style={[styles.closeButton, {
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.border,
            }]}
            onPress={onClose}
          >
            <Icon
              name="FirstAid"
              size={24}
              color={theme.colors.textSecondary}
              weight="duotone"
              style={{ transform: [{ rotate: '45deg' }] }}
            />
          </Pressable>
        </Animated.View>

        {/* Dock - 100px border-radius pill */}
        <Animated.View
          style={[
            styles.dock,
            {
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {/* Email Display */}
          <Pressable
            style={styles.emailDisplay}
            onPress={handleEmailClick}
          >
            <Icon
              name="Envelope"
              size={20}
              color={theme.colors.primary}
              weight="duotone"
            />
            <Text
              style={[styles.emailText, { color: theme.colors.textPrimary }]}
              numberOfLines={1}
            >
              {dropCalEmail}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 600,
    paddingHorizontal: 20,
  },
  externalButtonWrapper: {
    // Animation wrapper
  },

  // Dock - 100px border-radius pill
  dock: {
    flex: 1,
    height: 64,
    borderRadius: 100,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },

  // Email Display
  emailDisplay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 8,
  },

  emailText: {
    fontSize: 15,
    fontWeight: '400',
    fontFamily: 'Inter',
    textAlign: 'center',
  },

  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
});
