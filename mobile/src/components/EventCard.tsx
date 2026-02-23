import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Icon } from './Icon';

interface CalendarDateTime {
  dateTime: string;
  timeZone: string;
}

export interface CalendarEvent {
  id?: string;
  summary: string;
  start: CalendarDateTime;
  end: CalendarDateTime;
  location?: string;
  description?: string;
  recurrence?: string[];
  calendar?: string;
}

interface GoogleCalendar {
  id: string;
  summary: string;
  backgroundColor: string;
  foregroundColor?: string;
  primary?: boolean;
}

export interface EventCardProps {
  /** The event to display */
  event: CalendarEvent | null;
  /** Index for key generation */
  index: number;
  /** Loading state */
  isLoading?: boolean;
  /** Opacity for skeleton loading */
  skeletonOpacity?: number;
  /** Available calendars */
  calendars?: GoogleCalendar[];
  /** Format time range (start, end) => string */
  formatTimeRange: (start: string, end: string) => string;
  /** Get calendar color */
  getCalendarColor: (calendarName: string | undefined) => string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * EventCard component for React Native
 * Displays a calendar event with title, time, location, description, and calendar badge
 */
export function EventCard({
  event,
  index,
  isLoading = false,
  skeletonOpacity = 1,
  calendars = [],
  formatTimeRange,
  getCalendarColor,
  onClick,
}: EventCardProps) {
  // Loading skeleton
  if (isLoading && !event) {
    return (
      <View style={[styles.skeletonCard, { opacity: skeletonOpacity }]}>
        <View style={styles.skeletonContent}>
          <ActivityIndicator size="small" color="#9CA3AF" />
        </View>
      </View>
    );
  }

  // No event
  if (!event) return null;

  // Get calendar color
  const calendarColor = getCalendarColor(event.calendar);

  // Find calendar name
  const calendarName =
    calendars.find(
      (cal) =>
        cal.id === event.calendar ||
        cal.summary.toLowerCase() === event.calendar?.toLowerCase()
    )?.summary ||
    event.calendar ||
    'Primary';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: calendarColor, borderLeftWidth: 8 },
        pressed && styles.cardPressed,
      ]}
      onPress={onClick}
    >
      {/* Title with Time */}
      <View style={styles.row}>
        <Text style={styles.title}>
          {event.summary}{' '}
          <Text style={styles.timeInline}>
            ({formatTimeRange(event.start.dateTime, event.end.dateTime)})
          </Text>
        </Text>
      </View>

      {/* Location */}
      {event.location && (
        <View style={styles.row}>
          <View style={styles.meta}>
            <Icon name="MapPin" size={16} color="#6B7280" />
            <Text style={styles.metaText}>{event.location}</Text>
          </View>
        </View>
      )}

      {/* Description */}
      {event.description && (
        <View style={styles.row}>
          <View style={styles.meta}>
            <Icon name="Equals" size={16} color="#6B7280" />
            <Text style={styles.metaText}>{event.description}</Text>
          </View>
        </View>
      )}

      {/* Calendar Badge */}
      <View style={styles.row}>
        <View style={styles.calendarBadge}>
          <View
            style={[styles.calendarDot, { backgroundColor: calendarColor }]}
          />
          <Text style={styles.calendarText}>{calendarName}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 24,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 12,
  },
  cardPressed: {
    transform: [{ translateY: -2 }],
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    lineHeight: 25,
    flex: 1,
  },
  timeInline: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
    marginLeft: 8,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
  },
  metaText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 21,
    flex: 1,
  },
  calendarBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  calendarText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  skeletonCard: {
    minHeight: 140,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonContent: {
    padding: 24,
  },
});
