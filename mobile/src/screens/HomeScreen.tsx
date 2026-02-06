import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Logo, Icon, Card, Modal, toast, CalendarEvent } from '../components';
import {
  TextInputScreen,
  LinkInputScreen,
  EmailInputScreen,
  AudioRecorder,
} from './input';
import { useTheme } from '../theme';
import { pickImage, pickDocument, pickAudio, createFormData } from '../utils/fileUpload';
import * as backendClient from '../api/backend-client';
import { getGreeting } from '../utils/greetings';
import type { AppState, LoadingStateConfig } from '../AppContainer';

// Navigation type (will be properly typed when navigation structure is finalized)
type NavigationProp = any;

/**
 * HomeScreen Props - ALL state and handlers from AppContainer
 * This matches the web App.tsx WorkspaceProps pattern
 */
interface HomeScreenProps {
  // State from AppContainer
  appState: AppState;
  isProcessing: boolean;
  calendarEvents: CalendarEvent[];
  loadingConfig: LoadingStateConfig;
  feedbackMessage: string;

  // Handlers from AppContainer
  onFileUpload: (file: File) => Promise<void>;
  onAudioSubmit: (audioBlob: Blob) => Promise<void>;
  onTextSubmit: (text: string) => Promise<void>;
  onClearFile: () => void;
  onAddToCalendar: (editedEvents?: CalendarEvent[]) => Promise<void>;
  onNewSession: () => void;
}

/**
 * Button position in the circular layout
 */
interface ButtonPosition {
  id: string;
  icon: string;
  position: 'btn-left-1' | 'btn-left-2' | 'btn-left-3' | 'btn-right-1' | 'btn-right-2' | 'btn-right-3' | 'center';
  onPress: () => void;
}

/**
 * HomeScreen - Main screen with COMPLETE state management from AppContainer
 * Translated from web Workspace component pattern
 * Now receives ALL state and handlers as props (no local state for processing)
 */
export function HomeScreen({
  appState,
  isProcessing,
  calendarEvents,
  loadingConfig,
  feedbackMessage,
  onFileUpload,
  onAudioSubmit,
  onTextSubmit,
  onClearFile,
  onAddToCalendar,
  onNewSession,
}: HomeScreenProps) {
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const [showTextInput, setShowTextInput] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);

  // Get randomized greeting (can be personalized with user name in the future)
  // TODO: Pass user name when auth is implemented (matches web Workspace.tsx)
  const greeting = getGreeting();

  // Animation for greeting flip
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const prevGreeting = useRef(greeting);

  useEffect(() => {
    // Trigger flip animation when greeting changes
    if (prevGreeting.current !== greeting) {
      rotateAnim.setValue(0);
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
      prevGreeting.current = greeting;
    }
  }, [greeting, rotateAnim]);

  const rotateX = rotateAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['90deg', '0deg', '0deg'],
  });

  const opacity = rotateAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 1, 1],
  });

  /**
   * Handle text submission - uses handler from AppContainer
   */
  const handleLocalTextSubmit = useCallback(async (text: string) => {
    setShowTextInput(false);
    await onTextSubmit(text);
  }, [onTextSubmit]);

  /**
   * Handle link submission - uses handler from AppContainer
   */
  const handleLinkSubmit = useCallback(async (url: string) => {
    setShowLinkInput(false);
    await onTextSubmit(url); // Links are processed as text
  }, [onTextSubmit]);

  /**
   * Handle audio submission - uses handler from AppContainer
   */
  const handleLocalAudioSubmit = useCallback(async (audioBlob: Blob) => {
    setShowAudioRecorder(false);
    await onAudioSubmit(audioBlob);
  }, [onAudioSubmit]);

  /**
   * Handle audio file upload (not recording) - uses handler from AppContainer
   */
  const handleAudioUpload = useCallback(async () => {
    try {
      const result = await pickAudio();
      if (!result) return;

      // Handle both single file and array results
      const file = Array.isArray(result) ? result[0] : result;
      if (!file) return;

      setShowAudioRecorder(false);

      // Create File object from the picked file
      const audioFile = new File(
        [await fetch(file.uri).then(r => r.blob())],
        file.name || 'audio.m4a',
        { type: file.type || 'audio/m4a' }
      );

      await onFileUpload(audioFile);
    } catch (error) {
      console.error('Error processing audio file:', error);
      toast.error('Processing Failed', {
        description: error instanceof Error ? error.message : 'Could not process audio',
        duration: 4000,
      });
    }
  }, [onFileUpload]);

  /**
   * Handle image upload - uses handler from AppContainer
   */
  const handleImageUpload = useCallback(async () => {
    try {
      const result = await pickImage();
      if (!result) return;

      // Handle both single file and array results
      const file = Array.isArray(result) ? result[0] : result;
      if (!file) return;

      // Create File object from the picked file
      const imageFile = new File(
        [await fetch(file.uri).then(r => r.blob())],
        file.name || 'image.jpg',
        { type: file.type || 'image/jpeg' }
      );

      await onFileUpload(imageFile);
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Upload Failed', {
        description: error instanceof Error ? error.message : 'Could not upload image',
        duration: 4000,
      });
    }
  }, [onFileUpload]);

  /**
   * Handle document upload - uses handler from AppContainer
   */
  const handleDocumentUpload = useCallback(async () => {
    try {
      const result = await pickDocument({
        type: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      });
      if (!result) return;

      // Handle both single file and array results
      const file = Array.isArray(result) ? result[0] : result;
      if (!file) return;

      // Create File object from the picked document
      const docFile = new File(
        [await fetch(file.uri).then(r => r.blob())],
        file.name || 'document.pdf',
        { type: file.type || 'application/pdf' }
      );

      await onFileUpload(docFile);
    } catch (error) {
      console.error('Error uploading document:', error);
      toast.error('Upload Failed', {
        description: error instanceof Error ? error.message : 'Could not upload document',
        duration: 4000,
      });
    }
  }, [onFileUpload]);

  // Handle loading state
  if (appState === 'loading') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textPrimary }]}>
            {loadingConfig.message}
          </Text>
          {loadingConfig.submessage && (
            <Text style={[styles.loadingSubtext, { color: theme.colors.textSecondary }]}>
              {loadingConfig.submessage}
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Handle review state
  if (appState === 'review') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ScrollView style={styles.scrollView}>
          <View style={styles.reviewContainer}>
            <Text style={[styles.reviewTitle, { color: theme.colors.textPrimary }]}>
              Found {calendarEvents.length} event{calendarEvents.length !== 1 ? 's' : ''}
            </Text>

            <View style={styles.eventsPlaceholder}>
              <Text style={[styles.placeholderText, { color: theme.colors.textSecondary }]}>
                Events list UI coming soon
              </Text>
            </View>

            <View style={styles.actionButtons}>
              <Pressable
                style={[styles.actionButton, { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }]}
                onPress={onClearFile}
              >
                <Text style={[styles.actionButtonText, { color: theme.colors.textPrimary }]}>
                  Start Over
                </Text>
              </Pressable>

              <Pressable
                style={[styles.actionButton, styles.primaryButton, { backgroundColor: theme.colors.primary }]}
                onPress={() => onAddToCalendar()}
              >
                <Text style={[styles.actionButtonText, { color: '#ffffff' }]}>
                  Add to Calendar
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  /**
   * Define button positions in circular layout (for input state)
   */
  const buttons: ButtonPosition[] = [
    { id: 'link', icon: 'Link', position: 'btn-left-1', onPress: () => setShowLinkInput(true) },
    { id: 'image', icon: 'Image', position: 'btn-left-2', onPress: handleImageUpload },
    { id: 'document', icon: 'File', position: 'btn-left-3', onPress: handleDocumentUpload },
    { id: 'audio', icon: 'Microphone', position: 'btn-right-1', onPress: () => setShowAudioRecorder(true) },
    { id: 'text', icon: 'Pen', position: 'btn-right-2', onPress: () => setShowTextInput(true) },
    { id: 'email', icon: 'Envelope', position: 'btn-right-3', onPress: () => setShowEmailInput(true) },
  ];

  /**
   * Render a small circular button
   */
  const renderSmallButton = (button: ButtonPosition) => {
    const getButtonStyle = () => {
      switch (button.position) {
        case 'btn-left-1':
          return styles.btnLeft1;
        case 'btn-left-2':
          return styles.btnLeft2;
        case 'btn-left-3':
          return styles.btnLeft3;
        case 'btn-right-1':
          return styles.btnRight1;
        case 'btn-right-2':
          return styles.btnRight2;
        case 'btn-right-3':
          return styles.btnRight3;
        default:
          return {};
      }
    };

    return (
      <Pressable
        key={button.id}
        style={({ pressed }) => [
          styles.smallButton,
          { backgroundColor: theme.colors.background },
          getButtonStyle(),
          pressed && styles.buttonPressed,
          isProcessing && styles.buttonDisabled,
        ]}
        onPress={button.onPress}
        disabled={isProcessing}
      >
        <Icon
          name={button.icon as any}
          size={24}
          color={theme.colors.textSecondary}
        />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Logo and Greeting - matches web Workspace.tsx */}
        <View style={styles.header}>
          <View style={styles.greetingRow}>
            <Logo size={48} color={theme.colors.textPrimary} />
            <Animated.Text
              style={[
                styles.greetingText,
                { color: theme.colors.primary },
                {
                  opacity,
                  transform: [
                    { perspective: 1000 },
                    { rotateX },
                  ],
                }
              ]}
            >
              {greeting}
            </Animated.Text>
          </View>
        </View>

        {/* Circular Button Menu */}
        <View style={styles.buttonMenuContainer}>
          <View style={styles.buttonGrid}>
            {/* Small buttons (6 outer buttons) */}
            {buttons.map(renderSmallButton)}

            {/* Center button */}
            <Pressable
              style={({ pressed }) => [
                styles.centerButton,
                { backgroundColor: theme.colors.primary },
                pressed && styles.centerButtonPressed,
              ]}
            >
              <Icon name="ArrowFatUp" size={32} color="#ffffff" />
            </Pressable>
          </View>
        </View>

        {/* Processing Indicator */}
        {isProcessing && (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            <Text style={[styles.processingText, { color: theme.colors.textSecondary }]}>
              Processing...
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Text Input Modal */}
      <Modal visible={showTextInput} onClose={() => setShowTextInput(false)} animationType="fade" height="full">
        <TextInputScreen
          onClose={() => setShowTextInput(false)}
          onSubmit={handleLocalTextSubmit}
        />
      </Modal>

      {/* Link Input Modal */}
      <Modal visible={showLinkInput} onClose={() => setShowLinkInput(false)} animationType="fade" height="full">
        <LinkInputScreen
          onClose={() => setShowLinkInput(false)}
          onSubmit={handleLinkSubmit}
        />
      </Modal>

      {/* Email Input Modal */}
      <Modal visible={showEmailInput} onClose={() => setShowEmailInput(false)} animationType="fade" height="full">
        <EmailInputScreen
          onClose={() => setShowEmailInput(false)}
        />
      </Modal>

      {/* Audio Recorder Modal */}
      <Modal visible={showAudioRecorder} onClose={() => setShowAudioRecorder(false)} animationType="fade" height="full">
        <AudioRecorder
          onClose={() => setShowAudioRecorder(false)}
          onSubmit={handleLocalAudioSubmit}
          onUploadFile={handleAudioUpload}
        />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  // Loading state
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 40,
  },
  loadingText: {
    fontSize: 20,
    fontWeight: '600' as const,
    marginTop: 24,
    textAlign: 'center' as const,
  },
  loadingSubtext: {
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center' as const,
  },
  // Review state
  reviewContainer: {
    flex: 1,
    padding: 20,
  },
  reviewTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    marginBottom: 20,
    textAlign: 'center' as const,
  },
  eventsPlaceholder: {
    flex: 1,
    minHeight: 200,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginVertical: 40,
  },
  placeholderText: {
    fontSize: 16,
  },
  actionButtons: {
    flexDirection: 'row' as const,
    gap: 12,
    marginTop: 24,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center' as const,
  },
  primaryButton: {},
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  // Input state
  header: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
  },
  // Greeting row - EXACT match to web .greeting-row (desktop)
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12, // EXACT: web gap: 12px
  },
  // Greeting text - EXACT match to web .greeting-text (desktop)
  // Web CSS: font-size: 44px, line-height: 44px, font-weight: 700, letter-spacing: -0.02em
  greetingText: {
    fontFamily: 'Chillax',
    fontSize: 44, // EXACT: web desktop 44px
    fontWeight: '700',
    lineHeight: 44, // EXACT: web desktop 44px
    textAlign: 'center',
    letterSpacing: -0.88, // -0.02em × 44px = -0.88px
  },
  // Circular button menu container
  buttonMenuContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  // Button grid - using relative positioning to simulate CSS Grid
  buttonGrid: {
    width: 320,
    height: 188.8, // 60 + 14.4 + 60 + 14.4 + 60
    paddingHorizontal: 8,
    position: 'relative',
  },
  // Small button base styles (60x60 circles)
  smallButton: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    // iOS shadows
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    // Android elevation
    elevation: 4,
  },
  // Pressed state for small buttons
  buttonPressed: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  // Disabled state
  buttonDisabled: {
    opacity: 0.5,
  },
  // Left column buttons
  btnLeft1: {
    top: 0,
    left: 68, // Positioned to align right in column 1
  },
  btnLeft2: {
    top: 74.4, // 60 + 14.4 gap
    left: 54, // 68 - 14 (translateX offset)
  },
  btnLeft3: {
    top: 148.8, // (60 + 14.4) * 2
    left: 68,
  },
  // Right column buttons
  btnRight1: {
    top: 0,
    right: 68, // Positioned to align left in column 3
  },
  btnRight2: {
    top: 74.4,
    right: 54, // 68 - 14 (translateX offset)
  },
  btnRight3: {
    top: 148.8,
    right: 68,
  },
  // Center button (80x80 circle, spans all rows)
  centerButton: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    // Center horizontally and vertically
    left: 120, // (320 - 80) / 2
    top: 54.4, // (188.8 - 80) / 2
    // iOS shadows (heavier than small buttons)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    // Android elevation
    elevation: 8,
  },
  // Pressed state for center button
  centerButtonPressed: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  // Processing indicator
  processingContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  processingText: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
});
