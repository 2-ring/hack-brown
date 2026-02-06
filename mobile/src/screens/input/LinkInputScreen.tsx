import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { TextInput } from '../../components/TextInput';
import { Icon } from '../../components/Icon';
import { toast } from '../../components/Toast';
import { useTheme } from '../../theme';

export interface LinkInputScreenProps {
  /** Close handler */
  onClose: () => void;
  /** Submit handler with scraped content */
  onSubmit: (content: string) => void;
  /** API URL for backend */
  apiUrl?: string;
}

/**
 * Validate URL format
 */
const isValidUrl = (url: string): boolean => {
  if (!url.trim()) return false;

  // Simple URL regex that accepts http/https URLs
  const urlPattern = /^(https?:\/\/)?([\w-]+(\.[\w-]+)+)([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])?$/i;
  return urlPattern.test(url.trim());
};

/**
 * Link Input Screen
 * Allows user to submit a URL to scrape content
 */
export function LinkInputScreen({
  onClose,
  onSubmit,
  apiUrl = 'http://localhost:5000',
}: LinkInputScreenProps) {
  const [url, setUrl] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { theme } = useTheme();

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setIsValid(isValidUrl(value));
  };

  const handleSubmit = async () => {
    if (!isValid || !url.trim() || isLoading) {
      return;
    }

    setIsLoading(true);

    try {
      // Call backend endpoint to scrape URL
      const response = await fetch(`${apiUrl}/api/scrape-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: 'Failed to fetch URL',
        }));
        throw new Error(
          errorData.message || errorData.error || 'Failed to fetch URL content'
        );
      }

      const data = await response.json();

      if (!data.content) {
        throw new Error('No content found at URL');
      }

      // Submit the extracted content
      onSubmit(data.content);
      setUrl('');
      setIsValid(false);

      toast.success('URL Scraped', {
        description: 'Content successfully extracted from URL.',
        duration: 2000,
      });
    } catch (err) {
      console.error('Failed to fetch URL:', err);
      toast.error('Failed to Fetch', {
        description:
          err instanceof Error
            ? err.message
            : 'Could not retrieve content from the URL. Please try again.',
        duration: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.content}>
        {/* Close Button */}
        <Pressable
          style={[styles.iconButton, { backgroundColor: theme.colors.surface }]}
          onPress={onClose}
          disabled={isLoading}
        >
          <Icon name="X" size={24} color={theme.colors.textPrimary} />
        </Pressable>

        {/* Main Input Area */}
        <View style={styles.inputArea}>
          <TextInput
            value={url}
            onChangeText={handleUrlChange}
            placeholder="Paste URL here..."
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={isValid && !isLoading ? handleSubmit : undefined}
            editable={!isLoading}
            autoFocus
            fullWidth
            icon={<Icon name="Link" size={20} color={theme.colors.textSecondary} />}
            helperText={
              url && !isValid ? 'Please enter a valid URL' : undefined
            }
            error={url && !isValid ? 'Invalid URL format' : undefined}
          />
        </View>

        {/* Submit Button */}
        <View style={styles.actionButtons}>
          <Pressable
            style={[
              styles.submitButton,
              {
                backgroundColor:
                  isValid && !isLoading
                    ? theme.colors.primary
                    : theme.colors.disabled,
              },
            ]}
            onPress={handleSubmit}
            disabled={!isValid || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Icon
                name="ArrowFatUp"
                size={28}
                color={isValid ? '#ffffff' : theme.colors.textSecondary}
              />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
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
  inputArea: {
    flex: 1,
    justifyContent: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 20,
  },
  submitButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
});
