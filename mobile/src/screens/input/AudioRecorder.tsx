import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  Animated,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import { Icon } from '../../components/Icon';
import { useTheme } from '../../theme';

interface AudioRecorderProps {
  /** Callback when recording is cancelled */
  onClose: () => void;
  /** Callback when recording is submitted with audio blob */
  onSubmit: (audioBlob: Blob) => void;
  /** Callback to upload an audio file instead of recording */
  onUploadFile: () => void;
}

const WINDOW_WIDTH = Dimensions.get('window').width;
const NUM_BARS = 32;

/**
 * Audio Recording Screen for React Native
 *
 * Uses expo-av for audio recording with decorative visualization.
 * Auto-starts recording on mount.
 */
export function AudioRecorder({ onClose, onSubmit, onUploadFile }: AudioRecorderProps) {
  const { theme } = useTheme();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Animation values for the audio visualization bars
  const barAnimations = useRef(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(0.2))
  ).current;

  // Duration timer
  const durationInterval = useRef<NodeJS.Timeout | null>(null);

  // Start recording on mount
  useEffect(() => {
    startRecording();

    return () => {
      stopRecordingCleanup();
    };
  }, []);

  // Animate bars while recording
  useEffect(() => {
    if (isRecording) {
      animateBars();
    }
  }, [isRecording]);

  // Animate the visualization bars
  const animateBars = () => {
    const animations = barAnimations.map((anim, index) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: Math.random() * 0.8 + 0.2,
            duration: 200 + Math.random() * 200,
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: 0.2 + Math.random() * 0.3,
            duration: 200 + Math.random() * 200,
            useNativeDriver: false,
          }),
        ])
      );
    });

    Animated.stagger(50, animations).start();
  };

  // Start recording
  const startRecording = async () => {
    try {
      // Request permissions
      const permission = await Audio.requestPermissionsAsync();

      if (!permission.granted) {
        setPermissionDenied(true);
        Alert.alert(
          'Permission Required',
          'Microphone access is required to record audio. Please enable it in your device settings.',
          [{ text: 'OK', onPress: onClose }]
        );
        return;
      }

      // Set audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Create and start recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setIsRecording(true);

      // Start duration counter
      durationInterval.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert(
        'Recording Error',
        'Failed to start recording. Please try again.',
        [{ text: 'OK', onPress: onClose }]
      );
    }
  };

  // Stop recording and cleanup
  const stopRecordingCleanup = async () => {
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }

    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch (error) {
        console.error('Error stopping recording:', error);
      }
    }

    setIsRecording(false);
  };

  // Convert recording to Blob
  const convertToBlob = async (uri: string): Promise<Blob> => {
    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      return await response.blob();
    }

    // For native platforms, we need to read the file
    const response = await fetch(uri);
    const blob = await response.blob();
    return blob;
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!recording) {
      Alert.alert('No Recording', 'No audio has been recorded yet.');
      return;
    }

    try {
      // Stop recording
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      if (!uri) {
        Alert.alert('Error', 'Failed to get recording URI.');
        return;
      }

      // Convert to blob
      const blob = await convertToBlob(uri);

      // Submit the blob
      onSubmit(blob);
    } catch (error) {
      console.error('Error submitting recording:', error);
      Alert.alert('Error', 'Failed to submit recording. Please try again.');
    }
  };

  // Handle close
  const handleClose = async () => {
    await stopRecordingCleanup();
    onClose();
  };

  // Format duration as MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (permissionDenied) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.errorContainer}>
          <Icon name="Warning" size={48} color={theme.colors.error} />
          <Text style={[styles.errorText, { color: theme.colors.textSecondary }]}>
            Microphone permission is required
          </Text>
          <Pressable
            style={[styles.closeButtonError, { backgroundColor: theme.colors.surface }]}
            onPress={onClose}
          >
            <Icon name="X" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Upload Button - Top Left */}
      <Pressable
        style={[
          styles.externalButton,
          styles.uploadButton,
          { backgroundColor: theme.colors.surface },
        ]}
        onPress={onUploadFile}
      >
        {({ pressed }) => (
          <View style={[styles.buttonContent, pressed && styles.buttonPressed]}>
            <Icon name="FirstAid" size={24} color={theme.colors.primary} />
          </View>
        )}
      </Pressable>

      {/* Close Button - Top Right */}
      <Pressable
        style={[
          styles.externalButton,
          styles.closeButtonStyle,
          { backgroundColor: theme.colors.surface },
        ]}
        onPress={handleClose}
      >
        {({ pressed }) => (
          <View style={[styles.buttonContent, pressed && styles.buttonPressed]}>
            <Icon name="X" size={24} color={theme.colors.error} />
          </View>
        )}
      </Pressable>

      {/* Main Recording Dock */}
      <View style={[styles.dock, { backgroundColor: theme.colors.surface }]}>
        {/* Recording Status */}
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.recordingDot,
              { backgroundColor: theme.colors.border },
              isRecording && { backgroundColor: theme.colors.error },
            ]}
          />
          <Text style={[styles.durationText, { color: theme.colors.textPrimary }]}>
            {formatDuration(duration)}
          </Text>
        </View>

        {/* Audio Visualization */}
        <View style={styles.visualizerWrapper}>
          <View style={styles.visualizer}>
            {barAnimations.map((anim, index) => (
              <Animated.View
                key={index}
                style={[
                  styles.bar,
                  { backgroundColor: theme.colors.primary },
                  {
                    height: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [4, 40],
                    }),
                  },
                ]}
              />
            ))}
          </View>
        </View>

        {/* Recording Instructions */}
        <Text style={[styles.instructionText, { color: theme.colors.textSecondary }]}>
          {isRecording ? 'Recording...' : 'Tap submit when ready'}
        </Text>
      </View>

      {/* Submit Button - Bottom Center */}
      <Pressable
        style={[
          styles.externalButton,
          styles.submitButton,
          {
            backgroundColor: isRecording || recording
              ? theme.colors.primary
              : theme.colors.disabled,
          },
        ]}
        onPress={handleSubmit}
        disabled={!isRecording && !recording}
      >
        {({ pressed }) => (
          <View style={[styles.buttonContent, pressed && styles.buttonPressed]}>
            <Icon
              name="ArrowFatUp"
              size={28}
              color={isRecording || recording ? '#ffffff' : theme.colors.textSecondary}
            />
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorContainer: {
    alignItems: 'center',
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    color: lightColors.textSecondary,
    textAlign: 'center',
  },

  // Dock
  dock: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: lightColors.backgroundElevated,
    borderRadius: 24,
    padding: 24,
    shadowColor: lightColors.shadowLight,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 12,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: lightColors.border,
  },
  recordingDotActive: {
    backgroundColor: lightColors.error,
  },
  durationText: {
    fontSize: 18,
    fontWeight: '600',
    color: lightColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // Visualizer
  visualizerWrapper: {
    width: '100%',
    height: 60,
    marginBottom: 20,
  },
  visualizer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: 2,
  },
  bar: {
    flex: 1,
    backgroundColor: lightColors.primary,
    borderRadius: 8,
    minHeight: 4,
  },

  // Instructions
  instructionText: {
    fontSize: 14,
    color: lightColors.textSecondary,
    textAlign: 'center',
  },

  // External Buttons
  externalButton: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: lightColors.backgroundElevated,
    shadowColor: lightColors.shadowLight,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadButton: {
    top: 60,
    left: 20,
  },
  closeButton: {
    top: 60,
    right: 20,
  },
  submitButton: {
    bottom: 60,
    alignSelf: 'center',
  },

  // Button States
  buttonContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 28,
  },
  submitButtonContent: {
    backgroundColor: lightColors.primary,
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
