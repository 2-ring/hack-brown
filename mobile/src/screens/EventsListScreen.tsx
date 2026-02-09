import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import {
  EventCard,
  SwipeableEventCard,
  DateHeader,
  MonthHeader,
  Icon,
  Logo,
  toast,
} from '../components';
import type { CalendarEvent } from '../components';
import { useTheme } from '../theme';
import { formatTimeRange } from '../utils/dateTime';
import { editEvent } from '../api/backend-client';
import { EventEditScreen } from './EventEditScreen';

interface GoogleCalendar {
  id: string;
  summary: string;
  backgroundColor: string;
  foregroundColor?: string;
  primary?: boolean;
}

interface EventsListScreenProps {
  events?: CalendarEvent[];
  isLoading?: boolean;
  onConfirm?: () => void;
  onRefresh?: () => void;
  onAddEvent?: (event: CalendarEvent) => void;
  onDeleteEvent?: (event: CalendarEvent) => void;
  loadingConfig?: Array<{
    icon: string;
    message: string;
    submessage?: string;
    count?: number;
  }>;
}

interface EventListItem {
  type: 'month' | 'date' | 'event';
  data?: any;
  index?: number;
  key: string;
}

type BottomBarState = 'default' | 'chat' | 'editing' | 'editing-chat';

/**
 * Animated loading dots component
 */
function LoadingDots({ color }: { color: string }) {
  const opacity1 = useRef(new Animated.Value(0.3)).current;
  const opacity2 = useRef(new Animated.Value(0.3)).current;
  const opacity3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = () => {
      Animated.sequence([
        Animated.timing(opacity1, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity1, { toValue: 0.3, duration: 250, useNativeDriver: true }),
      ]).start();

      setTimeout(() => {
        Animated.sequence([
          Animated.timing(opacity2, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(opacity2, { toValue: 0.3, duration: 250, useNativeDriver: true }),
        ]).start();
      }, 166);

      setTimeout(() => {
        Animated.sequence([
          Animated.timing(opacity3, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(opacity3, { toValue: 0.3, duration: 250, useNativeDriver: true }),
        ]).start();
      }, 333);
    };

    animate();
    const interval = setInterval(animate, 1500);
    return () => clearInterval(interval);
  }, [opacity1, opacity2, opacity3]);

  return (
    <View style={styles.loadingDotsContainer}>
      <Animated.View style={[styles.loadingDot, { backgroundColor: color, opacity: opacity1 }]} />
      <Animated.View style={[styles.loadingDot, { backgroundColor: color, opacity: opacity2 }]} />
      <Animated.View style={[styles.loadingDot, { backgroundColor: color, opacity: opacity3 }]} />
    </View>
  );
}

/**
 * Helper function to group events by date
 */
const groupEventsByDate = (events: CalendarEvent[]): EventListItem[] => {
  const items: EventListItem[] = [];
  let currentMonth: string | null = null;
  let currentDate: string | null = null;

  events.forEach((event, index) => {
    if (!event) return;

    const eventDate = new Date(event.start.dateTime);
    const monthKey = `${eventDate.getFullYear()}-${eventDate.getMonth()}`;
    const dateKey = eventDate.toISOString().split('T')[0];

    // Add month header if needed
    if (monthKey !== currentMonth) {
      currentMonth = monthKey;
      items.push({
        type: 'month',
        data: eventDate,
        key: `month-${monthKey}`,
      });
    }

    // Add date header if needed
    if (dateKey !== currentDate) {
      currentDate = dateKey;
      items.push({
        type: 'date',
        data: eventDate,
        key: `date-${dateKey}`,
      });
    }

    // Add event
    items.push({
      type: 'event',
      data: event,
      index,
      key: `event-${index}`,
    });
  });

  return items;
};

/**
 * EventsListScreen - Display events with AI chat system
 * Agent 2: EventsListScreen with AI Chat System
 */
export function EventsListScreen({
  events = [],
  isLoading = false,
  onConfirm,
  onRefresh,
  onAddEvent,
  onDeleteEvent,
  loadingConfig,
}: EventsListScreenProps) {
  const navigation = useNavigation();
  const { theme } = useTheme();

  // State management
  const [refreshing, setRefreshing] = useState(false);
  const [calendars] = useState<GoogleCalendar[]>([]);
  const [bottomBarState, setBottomBarState] = useState<BottomBarState>('default');
  const [chatInput, setChatInput] = useState('');
  const [isProcessingEdit, setIsProcessingEdit] = useState(false);
  const [localEvents, setLocalEvents] = useState<CalendarEvent[]>(events);
  const [editingEventIndex, setEditingEventIndex] = useState<number | null>(null);

  // Update local events when props change
  useEffect(() => {
    setLocalEvents(events);
  }, [events]);

  /**
   * Get calendar color
   */
  const getCalendarColor = useCallback(
    (calendarName: string | undefined): string => {
      if (!calendarName) return theme.colors.primary;
      const calendar = calendars.find((cal) => cal.id === calendarName);
      return calendar?.backgroundColor || theme.colors.primary;
    },
    [calendars, theme.colors.primary]
  );

  /**
   * Handle event click
   */
  const handleEventClick = useCallback(
    (event: CalendarEvent, index: number) => {
      setEditingEventIndex(index);
      setBottomBarState('editing');
    },
    []
  );

  /**
   * Handle pull to refresh
   */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await onRefresh?.();
    setRefreshing(false);
  }, [onRefresh]);

  /**
   * Handle confirm button
   */
  const handleConfirm = useCallback(() => {
    onConfirm?.();
  }, [onConfirm]);

  /**
   * Handle opening chat
   */
  const handleOpenChat = useCallback(() => {
    if (bottomBarState === 'default') {
      setBottomBarState('chat');
    } else if (bottomBarState === 'editing') {
      setBottomBarState('editing-chat');
    }
  }, [bottomBarState]);

  /**
   * Handle closing chat
   */
  const handleCloseChat = useCallback(() => {
    setChatInput('');
    if (bottomBarState === 'chat') {
      setBottomBarState('default');
    } else if (bottomBarState === 'editing-chat') {
      setBottomBarState('editing');
    }
  }, [bottomBarState]);

  /**
   * Handle cancel editing
   */
  const handleCancelEditing = useCallback(() => {
    setEditingEventIndex(null);
    setBottomBarState('default');
  }, []);

  /**
   * Handle save event from modal
   */
  const handleSaveEvent = useCallback((event: CalendarEvent) => {
    if (editingEventIndex !== null) {
      const updatedEvents = [...localEvents];
      updatedEvents[editingEventIndex] = event;
      setLocalEvents(updatedEvents);
    }
    setEditingEventIndex(null);
    setBottomBarState('default');
  }, [editingEventIndex, localEvents]);

  /**
   * Handle sending AI edit request
   */
  const handleSendEditRequest = useCallback(async () => {
    if (!chatInput.trim() || isProcessingEdit) return;

    const instruction = chatInput.trim();
    setChatInput('');
    setIsProcessingEdit(true);

    // Show loading toast
    toast.info('Processing changes...', {
      description: 'AI is analyzing your request',
    });

    try {
      // Edit each event with the AI instruction
      const editPromises = localEvents.map((event) =>
        editEvent(event, instruction)
          .then((response) => response.modified_event)
          .catch((error) => {
            console.error('Error editing event:', error);
            return event; // Keep original if edit fails
          })
      );

      const updatedEvents = await Promise.all(editPromises);

      // Update local events state
      setLocalEvents(updatedEvents);

      // Show success toast
      toast.success('Changes applied!', {
        description: 'Events updated based on your request',
        duration: 3000,
      });

      // Reset state
      setBottomBarState('default');
    } catch (error) {
      console.error('Error processing edit request:', error);
      toast.error('Failed to apply changes', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    } finally {
      setIsProcessingEdit(false);
    }
  }, [chatInput, isProcessingEdit, localEvents]);

  /**
   * Group events by date
   */
  const listItems = groupEventsByDate(localEvents);

  /**
   * Render item based on type
   */
  const renderItem = useCallback(
    ({ item }: { item: EventListItem }) => {
      switch (item.type) {
        case 'month':
          return <MonthHeader date={item.data} />;

        case 'date':
          return <DateHeader date={item.data} />;

        case 'event':
          return (
            <SwipeableEventCard
              event={item.data}
              index={item.index!}
              isLoading={isLoading}
              calendars={calendars}
              formatTimeRange={formatTimeRange}
              getCalendarColor={getCalendarColor}
              onClick={() => handleEventClick(item.data, item.index!)}
              onSwipeRight={() => onAddEvent?.(item.data)}
              onSwipeLeft={() => onDeleteEvent?.(item.data)}
            />
          );

        default:
          return null;
      }
    },
    [isLoading, calendars, getCalendarColor, handleEventClick]
  );

  /**
   * Render empty state
   */
  const renderEmptyState = () => {
    if (isLoading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Icon
          name="Calendar"
          size={64}
          color={theme.colors.textSecondary}
          style={styles.emptyIcon}
        />
        <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>
          No Events Found
        </Text>
        <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
          Try uploading a different file or adjusting your input
        </Text>
      </View>
    );
  };

  /**
   * Render TopBar
   */
  const renderTopBar = () => (
    <View style={[styles.topBar, {
      backgroundColor: theme.colors.background,
      borderBottomColor: theme.colors.border,
    }]}>
      {/* Left: Calendar Selector */}
      <View style={styles.topBarLeft}>
        <Text style={[styles.calendarSelector, { color: theme.colors.textPrimary }]}>
          Google Calendar
        </Text>
      </View>

      {/* Center: Logo */}
      <View style={styles.topBarCenter}>
        <Logo size={32} />
      </View>

      {/* Right: Event Count */}
      <View style={styles.topBarRight}>
        <Text style={[styles.eventCount, { color: theme.colors.textSecondary }]}>
          {localEvents.length} event{localEvents.length === 1 ? '' : 's'}
        </Text>
      </View>
    </View>
  );

  /**
   * Render BottomBar based on state
   */
  const renderBottomBar = () => {
    // Loading state
    if (isLoading && loadingConfig) {
      return (
        <>
          {/* Gradient Fade */}
          <LinearGradient
            colors={['transparent', theme.colors.background]}
            style={styles.gradientFade}
            pointerEvents="none"
          />

          <View style={[styles.bottomBar, {
            backgroundColor: theme.colors.background,
            borderTopColor: theme.colors.border,
          }]}>
            <View style={styles.bottomBarContent}>
              <LoadingDots color={theme.colors.primary} />
              <Text style={[styles.processingText, { color: theme.colors.textSecondary }]}>
                Processing...
              </Text>
            </View>
          </View>
        </>
      );
    }

    // No events - don't show bottom bar
    if (localEvents.length === 0) {
      return null;
    }

    // DEFAULT or EDITING state
    if (bottomBarState === 'default' || bottomBarState === 'editing') {
      return (
        <>
          {/* Gradient Fade */}
          <LinearGradient
            colors={['transparent', theme.colors.background]}
            style={styles.gradientFade}
            pointerEvents="none"
          />

          <View style={[styles.bottomBar, {
            backgroundColor: theme.colors.background,
            borderTopColor: theme.colors.border,
          }]}>
            <View style={styles.bottomBarRow}>
              {/* Event count (left side) */}
              <Text style={[styles.eventCountText, { color: theme.colors.textSecondary }]}>
                {localEvents.length} event{localEvents.length === 1 ? '' : 's'}
              </Text>

              {/* Cancel button (only in editing mode) */}
              {bottomBarState === 'editing' && (
                <Pressable
                  onPress={handleCancelEditing}
                  style={styles.cancelButton}
                >
                  <Icon name="X" size={20} color={theme.colors.textSecondary} />
                </Pressable>
              )}

              {/* Request Changes Button */}
              <Pressable
                onPress={handleOpenChat}
                style={[styles.requestChangesButton, {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                }]}
              >
                <Icon name="ChatCircleDots" size={18} color={theme.colors.textPrimary} weight="bold" />
                <Text style={[styles.requestChangesText, { color: theme.colors.textPrimary }]}>
                  Request changes
                </Text>
              </Pressable>

              {/* Confirm/Save Button */}
              {onConfirm && (
                <Pressable
                  onPress={bottomBarState === 'editing' ? handleCancelEditing : handleConfirm}
                  style={[styles.confirmButton, {
                    backgroundColor: theme.colors.primary,
                    shadowColor: theme.colors.primary,
                  }]}
                >
                  <Icon
                    name={bottomBarState === 'editing' ? 'Check' : 'CalendarStar'}
                    size={24}
                    color="#ffffff"
                    weight="duotone"
                  />
                </Pressable>
              )}
            </View>
          </View>
        </>
      );
    }

    // CHAT or EDITING-CHAT state
    return (
      <>
        {/* Gradient Fade */}
        <LinearGradient
          colors={['transparent', theme.colors.background]}
          style={styles.gradientFade}
          pointerEvents="none"
        />

        <View style={[styles.bottomBar, {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
        }]}>
          <View style={styles.bottomBarRow}>
            {/* Cancel Button */}
            <Pressable
              onPress={handleCloseChat}
              style={styles.cancelButton}
            >
              <Icon name="X" size={20} color={theme.colors.textSecondary} />
            </Pressable>

            {/* Chat Input */}
            <TextInput
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Request changes..."
              placeholderTextColor={theme.colors.textSecondary}
              style={[styles.chatInput, {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                color: theme.colors.textPrimary,
              }]}
              autoFocus
              returnKeyType="send"
              onSubmitEditing={handleSendEditRequest}
              editable={!isProcessingEdit}
            />

            {/* Send Button */}
            <Pressable
              onPress={handleSendEditRequest}
              disabled={!chatInput.trim() || isProcessingEdit}
              style={[styles.sendButton, {
                backgroundColor: (!chatInput.trim() || isProcessingEdit)
                  ? theme.colors.disabled
                  : theme.colors.primary,
              }]}
            >
              <Icon
                name="PaperPlaneTilt"
                size={22}
                color="#ffffff"
                weight="fill"
              />
            </Pressable>
          </View>
        </View>
      </>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* TopBar */}
      {renderTopBar()}

      {/* Events List */}
      <FlatList
        data={listItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[
          styles.listContent,
          listItems.length === 0 && styles.listContentEmpty,
        ]}
        style={styles.eventsList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={renderEmptyState}
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={10}
      />

      {/* BottomBar */}
      {renderBottomBar()}

      {/* Event Edit Modal */}
      <Modal
        visible={editingEventIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCancelEditing}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={handleCancelEditing}
        >
          <Pressable
            style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}
            onPress={(e) => e.stopPropagation()}
          >
            {editingEventIndex !== null && (
              <EventEditScreen
                event={localEvents[editingEventIndex]}
                calendars={calendars}
                onSave={handleSaveEvent}
                onClose={handleCancelEditing}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // TopBar Styles
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  topBarLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },
  topBarCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  calendarSelector: {
    fontSize: 14,
    fontWeight: '500',
  },
  eventCount: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Events List Styles
  eventsList: {
    position: 'absolute',
    top: 56,
    bottom: 56,
    left: 0,
    right: 0,
  },
  listContent: {
    paddingBottom: 20,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  // Empty State Styles
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
  },

  // BottomBar Styles
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
    justifyContent: 'center',
  },
  bottomBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  // Loading State Styles
  loadingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  loadingStepText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  loadingStepCount: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Request Changes Button
  requestChangesButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  requestChangesText: {
    fontSize: 15,
    fontWeight: '500',
  },

  // Confirm Button
  confirmButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },

  // Cancel Button
  cancelButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Chat Input
  chatInput: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
  },

  // Send Button
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 16,
  },

  // Gradient Fade
  gradientFade: {
    position: 'absolute',
    bottom: 56,
    left: 0,
    right: 0,
    height: 40,
    zIndex: 5,
  },

  // Loading Dots
  loadingDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Bottom Bar Content
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  // Event Count
  eventCountText: {
    fontSize: 14,
    fontWeight: '500',
    marginRight: 'auto',
  },

  // Processing Text
  processingText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
