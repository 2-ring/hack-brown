import React from 'react';
import { View, StyleSheet, Pressable, Text, Linking, Alert } from 'react-native';
import { Icon } from '../../components/Icon';
import { useTheme } from '../../theme';

interface EmailInputScreenProps {
  /** Close handler */
  onClose: () => void;
  /** Optional user email (from auth context if available) */
  userEmail?: string;
}

/**
 * Email Input Screen
 * Displays the DropCal email address and opens email client
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
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        {/* Close Button */}
        <Pressable
          style={[styles.iconButton, { backgroundColor: theme.colors.surface }]}
          onPress={onClose}
        >
          <Icon name="X" size={24} color={theme.colors.textPrimary} />
        </Pressable>

        {/* Main Content */}
        <View style={styles.emailArea}>
          <View style={styles.instructionContainer}>
            <Icon
              name="Envelope"
              size={48}
              color={theme.colors.primary}
              style={styles.envelopeIcon}
            />
            <Text style={[styles.instructionText, { color: theme.colors.textPrimary }]}>
              Forward emails to your personal DropCal address
            </Text>
          </View>

          {/* Email Display Pill */}
          <Pressable
            style={({ pressed }) => [
              styles.emailPill,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.primary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            onPress={handleEmailClick}
          >
            <Icon
              name="Envelope"
              size={20}
              color={theme.colors.primary}
              style={styles.emailIcon}
            />
            <Text
              style={[styles.emailText, { color: theme.colors.primary }]}
              numberOfLines={1}
            >
              {dropCalEmail}
            </Text>
          </Pressable>

          <Text
            style={[styles.helperText, { color: theme.colors.textSecondary }]}
          >
            Tap to open your email client
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  content: {
    flex: 1,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 20,
  },
  emailArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  instructionContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  envelopeIcon: {
    marginBottom: 16,
  },
  instructionText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 26,
  },
  emailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 30,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 12,
  },
  emailIcon: {
    marginRight: 12,
  },
  emailText: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  helperText: {
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
