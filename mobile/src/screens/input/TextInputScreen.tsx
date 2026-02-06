import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { TextInput } from '../../components/TextInput';
import { Icon } from '../../components/Icon';
import { readFromClipboard } from '../../utils/clipboard';
import { toast } from '../../components/Toast';
import { useTheme } from '../../theme';

export interface TextInputScreenProps {
  /** Close handler */
  onClose: () => void;
  /** Submit handler with text content */
  onSubmit: (text: string) => void;
}

/**
 * Text Input Screen
 * Allows user to paste or type event details
 */
export function TextInputScreen({ onClose, onSubmit }: TextInputScreenProps) {
  const [text, setText] = useState('');
  const { theme } = useTheme();

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text);
      setText('');
    }
  };

  const handlePaste = async () => {
    try {
      const clipboardText = await readFromClipboard();
      if (clipboardText) {
        setText(clipboardText);
      } else {
        toast.info('Clipboard Empty', {
          description: 'No text found in clipboard.',
          duration: 2000,
        });
      }
    } catch (err) {
      toast.error('Paste Failed', {
        description: 'Could not access clipboard. Please paste manually.',
        duration: 3000,
      });
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
        >
          <Icon name="X" size={24} color={theme.colors.textPrimary} />
        </Pressable>

        {/* Main Input Area */}
        <View style={styles.inputArea}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Paste or type event details here..."
            multiline
            numberOfLines={6}
            returnKeyType="default"
            blurOnSubmit={false}
            autoFocus
            fullWidth
            inputStyle={styles.textInput}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {/* Paste Button */}
          <Pressable
            style={[styles.actionButton, { backgroundColor: theme.colors.surface }]}
            onPress={handlePaste}
          >
            <Icon name="ClipboardText" size={24} color={theme.colors.primary} />
          </Pressable>

          {/* Submit Button */}
          <Pressable
            style={[
              styles.submitButton,
              {
                backgroundColor: text.trim()
                  ? theme.colors.primary
                  : theme.colors.disabled,
              },
            ]}
            onPress={handleSubmit}
            disabled={!text.trim()}
          >
            <Icon
              name="ArrowFatUp"
              size={28}
              color={text.trim() ? '#ffffff' : theme.colors.textSecondary}
            />
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
  textInput: {
    minHeight: 150,
    textAlignVertical: 'top',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  actionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
