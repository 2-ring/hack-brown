/**
 * AppContainer - Main application container with ALL business logic from web App.tsx
 * This is a 1:1 translation of frontend/src/App.tsx AppContent component
 */

import { useState, useCallback, useEffect, ReactNode } from 'react';
import { toast, CalendarEvent } from './components';
import { useAuth } from './auth/AuthContext';
import type { Session as BackendSession } from './api/types';
import {
  createTextSession,
  uploadFile as apiUploadFile,
  getUserSessions,
  getSession,
  pollSession,
  addSessionToCalendar,
} from './api/backend-client';
import { syncCalendar } from './api/sync';

export type AppState = 'input' | 'loading' | 'review';

// Simple session list item for menu
export interface SessionListItem {
  id: string;
  title: string;
  timestamp: Date;
  inputType: 'text' | 'image' | 'audio' | 'document';
  status: 'active' | 'completed' | 'error';
  eventCount: number;
}

export interface LoadingStateConfig {
  message: string;
  submessage?: string;
}

export const LOADING_MESSAGES = {
  READING_FILE: {
    message: 'Reading your file',
    submessage: 'Hang tight...',
  },
  PROCESSING_FILE: {
    message: 'Processing',
    submessage: 'Looking for events...',
  },
  PROCESSING_TEXT: {
    message: 'Processing your text',
    submessage: 'Extracting events...',
  },
  EXTRACTING_EVENTS: {
    message: 'Extracting events',
    submessage: 'Almost done...',
  },
};

interface AppContainerProps {
  children: (props: AppContainerRenderProps) => ReactNode;
  currentSessionId?: string;
  onNavigateToSession?: (sessionId: string) => void;
  onNavigateHome?: () => void;
}

export interface AppContainerRenderProps {
  // State
  appState: AppState;
  isProcessing: boolean;
  calendarEvents: CalendarEvent[];
  loadingConfig: LoadingStateConfig;
  sidebarOpen: boolean;
  feedbackMessage: string;
  currentSession: BackendSession | null;
  sessionHistory: BackendSession[];

  // Handlers
  handleSidebarToggle: () => void;
  handleFileUpload: (file: File) => Promise<void>;
  handleAudioSubmit: (audioBlob: Blob) => Promise<void>;
  handleTextSubmit: (text: string) => Promise<void>;
  handleClearFile: () => void;
  handleSessionClick: (sessionId: string) => void;
  handleNewSession: () => void;
  handleAddToCalendar: (editedEvents?: CalendarEvent[]) => Promise<void>;

  // Computed
  menuSessions: SessionListItem[];
}

/**
 * Main application container - translated from web App.tsx AppContent component
 * Contains ALL state management and business logic
 */
export function AppContainer({
  children,
  currentSessionId,
  onNavigateToSession,
  onNavigateHome,
}: AppContainerProps) {
  const { user } = useAuth();

  const [appState, setAppState] = useState<AppState>('input');
  const [isProcessing, setIsProcessing] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loadingConfig, setLoadingConfig] = useState<LoadingStateConfig>(LOADING_MESSAGES.READING_FILE);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');

  // Session state (from backend)
  const [currentSession, setCurrentSession] = useState<BackendSession | null>(null);
  const [sessionHistory, setSessionHistory] = useState<BackendSession[]>([]);

  // Load session from URL on mount or when sessionId changes
  useEffect(() => {
    if (currentSessionId && user) {
      setIsProcessing(true);
      setAppState('loading');
      setLoadingConfig(LOADING_MESSAGES.READING_FILE);

      getSession(currentSessionId)
        .then(session => {
          setCurrentSession(session);

          if (session.processed_events && session.processed_events.length > 0) {
            setCalendarEvents(session.processed_events as CalendarEvent[]);
            setAppState('review');
          } else {
            setAppState('input');
          }
        })
        .catch(error => {
          console.error('Failed to load session:', error);
          toast.error('Failed to Load Session', {
            description: 'The session could not be found.',
            duration: 5000,
          });
          onNavigateHome?.();
          setAppState('input');
        })
        .finally(() => {
          setIsProcessing(false);
        });
    }
  }, [currentSessionId, user, onNavigateHome]);

  // Load session history and sync calendar when user logs in
  useEffect(() => {
    if (user) {
      getUserSessions().then(setSessionHistory).catch(console.error);

      // Sync calendar with provider (smart backend decides strategy)
      syncCalendar()
        .then(result => {
          if (result.skipped) {
            console.log(`Calendar sync skipped: ${result.reason}`);
          } else {
            console.log(
              `Calendar synced (${result.strategy}): ` +
              `+${result.events_added} ~${result.events_updated} -${result.events_deleted} ` +
              `(Total: ${result.total_events_in_db} events)`
            );
          }
        })
        .catch(error => {
          // Silent fail - don't interrupt user experience if sync fails
          console.error('Calendar sync failed:', error);
        });
    }
  }, [user]);

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  // Process file upload
  const processFile = useCallback(async (file: File) => {
    if (!user) {
      toast.error('Sign In Required', {
        description: 'Please sign in to upload files.',
        duration: 3000,
      });
      return;
    }

    if (isProcessing) {
      toast.warning('Already Processing', {
        description: 'Please wait for the current file to finish processing.',
        duration: 3000,
      });
      return;
    }

    setIsProcessing(true);
    setAppState('loading');
    setCalendarEvents([]);
    setFeedbackMessage('');
    setLoadingConfig(LOADING_MESSAGES.READING_FILE);

    try {
      // Determine file type
      const fileType = file.type.startsWith('audio/') ? 'audio' : 'image';

      const { session } = await apiUploadFile(file, fileType);
      setCurrentSession(session);
      setLoadingConfig(LOADING_MESSAGES.PROCESSING_FILE);

      // Poll for completion
      const completedSession = await pollSession(
        session.id,
        (updatedSession) => {
          setCurrentSession(updatedSession);

          // Update loading message based on status
          if (updatedSession.status === 'processing') {
            setLoadingConfig(LOADING_MESSAGES.EXTRACTING_EVENTS);
          }
        },
        2000
      );

      // Check if events were found
      if (!completedSession.processed_events || completedSession.processed_events.length === 0) {
        setFeedbackMessage("Hmm, we couldn't find any events in there. Try a different file!");
        setAppState('input');
        return;
      }

      // Display results
      setCalendarEvents(completedSession.processed_events as CalendarEvent[]);
      setAppState('review');

      // Navigate to the session URL
      onNavigateToSession?.(completedSession.id);

      // Refresh session history
      getUserSessions().then(setSessionHistory).catch(console.error);

    } catch (error) {
      toast.error('Error', {
        description: "Oops! Something went wrong. Mind trying that again?",
        duration: 4000,
      });
      setAppState('input');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, user, onNavigateToSession]);

  // Process text input
  const processText = useCallback(async (text: string) => {
    if (!user) {
      toast.error('Sign In Required', {
        description: 'Please sign in to process text.',
        duration: 3000,
      });
      return;
    }

    if (isProcessing) {
      toast.warning('Already Processing', {
        description: 'Please wait for the current input to finish processing.',
        duration: 3000,
      });
      return;
    }

    setIsProcessing(true);
    setAppState('loading');
    setCalendarEvents([]);
    setFeedbackMessage('');
    setLoadingConfig(LOADING_MESSAGES.PROCESSING_TEXT);

    try {
      const session = await createTextSession(text);
      setCurrentSession(session);

      // Poll for completion
      const completedSession = await pollSession(
        session.id,
        (updatedSession) => {
          setCurrentSession(updatedSession);

          // Update loading message based on status
          if (updatedSession.status === 'processing') {
            setLoadingConfig(LOADING_MESSAGES.EXTRACTING_EVENTS);
          }
        },
        2000
      );

      // Check if events were found
      if (!completedSession.processed_events || completedSession.processed_events.length === 0) {
        setFeedbackMessage("The text doesn't appear to contain any calendar events.");
        setAppState('input');
        return;
      }

      // Display results
      setCalendarEvents(completedSession.processed_events as CalendarEvent[]);
      setAppState('review');

      // Navigate to the session URL
      onNavigateToSession?.(completedSession.id);

      // Refresh session history
      getUserSessions().then(setSessionHistory).catch(console.error);

    } catch (error) {
      toast.error('Error', {
        description: "Oops! Something went wrong. Mind trying that again?",
        duration: 4000,
      });
      setAppState('input');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, user, onNavigateToSession]);

  // Handle file upload
  const handleFileUpload = useCallback((file: File) => {
    processFile(file);
  }, [processFile]);

  // Handle audio submission
  const handleAudioSubmit = useCallback((audioBlob: Blob) => {
    const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });

    if (audioBlob.size < 1000) {
      toast.error('Recording Too Short', {
        description: 'Please record for at least a few seconds.',
        duration: 4000,
      });
      return;
    }

    processFile(audioFile);
  }, [processFile]);

  // Handle text submission
  const handleTextSubmit = useCallback((text: string) => {
    processText(text);
  }, [processText]);

  // Handle clearing file
  const handleClearFile = useCallback(() => {
    setCalendarEvents([]);
    setAppState('input');
  }, []);

  // Handle session click (load from history)
  const handleSessionClick = useCallback((sessionId: string) => {
    onNavigateToSession?.(sessionId);
    setSidebarOpen(false);
  }, [onNavigateToSession]);

  // Handle new session
  const handleNewSession = useCallback(() => {
    onNavigateHome?.();
    setSidebarOpen(false);
  }, [onNavigateHome]);

  // Handle adding events to Google Calendar
  const handleAddToCalendar = useCallback(async (editedEvents?: CalendarEvent[]) => {
    if (!user) {
      toast.error('Sign In Required', {
        description: 'Please sign in to add events to your calendar.',
        duration: 3000,
      });
      return;
    }

    if (!currentSession) {
      toast.error('No Session', {
        description: 'No session available to add to calendar.',
        duration: 3000,
      });
      return;
    }

    try {
      toast.loading('Adding to Calendar...', {
        id: 'calendar-add',
        description: 'Creating events in Google Calendar...',
      });

      // Pass edited events for correction logging
      const result = await addSessionToCalendar(currentSession.id, editedEvents);

      // Dismiss loading toast
      toast.dismiss('calendar-add');

      // Show success message
      if (result.has_conflicts) {
        toast.warning('Events Added with Conflicts', {
          description: `Created ${result.num_events_created} event(s), but found ${result.conflicts.length} scheduling conflict(s).`,
          duration: 5000,
        });
      } else {
        toast.success('Added to Calendar!', {
          description: `Successfully created ${result.num_events_created} event(s) in Google Calendar.`,
          duration: 4000,
        });
      }

      // Reload the session to get updated calendar_event_ids
      const updatedSession = await getSession(currentSession.id);
      setCurrentSession(updatedSession);

    } catch (error) {
      toast.dismiss('calendar-add');

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Check if it's an auth error
      if (errorMessage.includes('not connected') || errorMessage.includes('not authenticated')) {
        toast.error('Google Calendar Not Connected', {
          description: 'Please sign in with Google to use calendar integration.',
          duration: 5000,
        });
      } else {
        toast.error('Failed to Add to Calendar', {
          description: errorMessage,
          duration: 5000,
        });
      }
    }
  }, [user, currentSession]);

  // Convert backend sessions to menu format
  const menuSessions: SessionListItem[] = sessionHistory.map(session => ({
    id: session.id,
    title: session.input_content.substring(0, 50) + (session.input_content.length > 50 ? '...' : ''),
    timestamp: new Date(session.created_at),
    inputType: session.input_type as 'text' | 'image' | 'audio',
    status: session.status === 'processed' ? 'completed' : session.status === 'error' ? 'error' : 'active',
    eventCount: session.processed_events?.length || 0,
  }));

  return (
    <>
      {children({
        // State
        appState,
        isProcessing,
        calendarEvents,
        loadingConfig,
        sidebarOpen,
        feedbackMessage,
        currentSession,
        sessionHistory,

        // Handlers
        handleSidebarToggle,
        handleFileUpload,
        handleAudioSubmit,
        handleTextSubmit,
        handleClearFile,
        handleSessionClick,
        handleNewSession,
        handleAddToCalendar,

        // Computed
        menuSessions,
      })}
    </>
  );
}
