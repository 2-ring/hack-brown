import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Logo, Icon, Card, Modal, toast } from '../components';
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

// Navigation type (will be properly typed when navigation structure is finalized)
type NavigationProp = any;

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
 * HomeScreen - Main screen with input options
 * Task 36: Create Home Screen
 */
export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);

  // Get randomized greeting (can be personalized with user name in the future)
  const greeting = getGreeting();

  /**
   * Handle text submission
   */
  const handleTextSubmit = useCallback(async (text: string) => {
    try {
      setIsProcessing(true);
      setShowTextInput(false);

      const session = await backendClient.createTextSession(text);

      // Navigate to events list with session data
      // TODO: Implement navigation to EventsList screen with session
      toast.success('Processing Complete', {
        description: `Found ${session.processed_events?.length || 0} events`,
        duration: 3000,
      });
    } catch (error) {
      console.error('Error processing text:', error);
      toast.error('Processing Failed', {
        description: error instanceof Error ? error.message : 'Could not process text',
        duration: 4000,
      });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * Handle link submission
   */
  const handleLinkSubmit = useCallback(async (url: string) => {
    try {
      setIsProcessing(true);
      setShowLinkInput(false);

      // Use createTextSession for URLs as well
      const session = await backendClient.createTextSession(url);

      toast.success('Processing Complete', {
        description: `Found ${session.processed_events?.length || 0} events`,
        duration: 3000,
      });
    } catch (error) {
      console.error('Error processing link:', error);
      toast.error('Processing Failed', {
        description: error instanceof Error ? error.message : 'Could not process link',
        duration: 4000,
      });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * Handle audio submission
   */
  const handleAudioSubmit = useCallback(async (audioBlob: Blob) => {
    try {
      setIsProcessing(true);
      setShowAudioRecorder(false);

      // Convert blob to FormData
      // Create a File object from the Blob
      const audioFile = new File([audioBlob], 'recording.wav', { type: 'audio/wav' });

      const result = await backendClient.uploadFile(audioFile, 'audio');

      toast.success('Processing Complete', {
        description: `Found ${result.session.processed_events?.length || 0} events`,
        duration: 3000,
      });
    } catch (error) {
      console.error('Error processing audio:', error);
      toast.error('Processing Failed', {
        description: error instanceof Error ? error.message : 'Could not process audio',
        duration: 4000,
      });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * Handle audio file upload (not recording)
   */
  const handleAudioUpload = useCallback(async () => {
    try {
      const result = await pickAudio();
      if (!result) return;

      // Handle both single file and array results
      const file = Array.isArray(result) ? result[0] : result;
      if (!file) return;

      setIsProcessing(true);
      setShowAudioRecorder(false);

      // Create File object from the picked file
      const audioFile = new File(
        [await fetch(file.uri).then(r => r.blob())],
        file.name || 'audio.m4a',
        { type: file.type || 'audio/m4a' }
      );

      const uploadResult = await backendClient.uploadFile(audioFile, 'audio');

      toast.success('Processing Complete', {
        description: `Found ${uploadResult.session.processed_events?.length || 0} events`,
        duration: 3000,
      });
    } catch (error) {
      console.error('Error processing audio file:', error);
      toast.error('Processing Failed', {
        description: error instanceof Error ? error.message : 'Could not process audio',
        duration: 4000,
      });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * Handle image upload
   */
  const handleImageUpload = useCallback(async () => {
    try {
      const result = await pickImage();
      if (!result) return;

      // Handle both single file and array results
      const file = Array.isArray(result) ? result[0] : result;
      if (!file) return;

      setIsProcessing(true);

      // Create File object from the picked file
      const imageFile = new File(
        [await fetch(file.uri).then(r => r.blob())],
        file.name || 'image.jpg',
        { type: file.type || 'image/jpeg' }
      );

      const uploadResult = await backendClient.uploadFile(imageFile, 'image');

      toast.success('Processing Complete', {
        description: `Found ${uploadResult.session.processed_events?.length || 0} events`,
        duration: 3000,
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Upload Failed', {
        description: error instanceof Error ? error.message : 'Could not upload image',
        duration: 4000,
      });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * Handle document upload
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

      setIsProcessing(true);

      // Create File object from the picked document
      const docFile = new File(
        [await fetch(file.uri).then(r => r.blob())],
        file.name || 'document.pdf',
        { type: file.type || 'application/pdf' }
      );

      const uploadResult = await backendClient.uploadFile(docFile, 'image'); // Using 'image' type as backend handles it

      toast.success('Processing Complete', {
        description: `Found ${uploadResult.session.processed_events?.length || 0} events`,
        duration: 3000,
      });
    } catch (error) {
      console.error('Error uploading document:', error);
      toast.error('Upload Failed', {
        description: error instanceof Error ? error.message : 'Could not upload document',
        duration: 4000,
      });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * Define button positions in circular layout
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
        {/* Header with Logo and Greeting */}
        <View style={styles.header}>
          <Logo size={48} />
          <Text style={[styles.greeting, { color: theme.colors.textPrimary }]}>
            {greeting}
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Drop anything in. Get calendar events out.
          </Text>
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
          onSubmit={handleTextSubmit}
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
          onSubmit={handleAudioSubmit}
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
  header: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
  },
  greeting: {
    fontFamily: 'Chillax',
    fontSize: 44,
    fontWeight: '700',
    lineHeight: 44,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400',
    textAlign: 'center',
    paddingHorizontal: 20,
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
