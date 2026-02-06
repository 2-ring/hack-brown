import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import {
  TextInput,
  Icon,
  Button,
  DatePicker,
  TimePicker,
} from '../components';
import type { CalendarEvent } from '../components';
import { useTheme } from '../theme';
import { formatDateWithWeekday, formatTime } from '../utils/dateTime';

interface GoogleCalendar {
  id: string;
  summary: string;
  backgroundColor: string;
  foregroundColor?: string;
  primary?: boolean;
}

interface EventEditScreenProps {
  event?: CalendarEvent;
  calendars?: GoogleCalendar[];
  onSave?: (event: CalendarEvent) => void;
  onClose?: () => void;
}

/**
 * EventEditScreen - Event editing form (used as modal)
 * Task 37: Create EventEditView Screen
 */
export function EventEditScreen({
  event: propEvent,
  calendars: propCalendars = [],
  onSave,
  onClose,
}: EventEditScreenProps) {
  const { theme } = useTheme();

  const initialEvent: CalendarEvent = propEvent || {
    summary: '',
    start: {
      dateTime: new Date().toISOString(),
      timeZone: 'America/New_York',
    },
    end: {
      dateTime: new Date(Date.now() + 3600000).toISOString(), // +1 hour
      timeZone: 'America/New_York',
    },
    location: '',
    description: '',
    calendar: undefined,
  };

  const calendars = propCalendars;

  const [editedEvent, setEditedEvent] = useState<CalendarEvent>(initialEvent);
  const [isAllDay, setIsAllDay] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);

  /**
   * Update event field
   */
  const handleChange = (field: keyof CalendarEvent, value: any) => {
    setEditedEvent((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  /**
   * Handle calendar selection
   */
  const handleCalendarSelect = (calendarId: string) => {
    handleChange('calendar', calendarId);
  };

  /**
   * Handle start date change
   */
  const handleStartDateChange = (date: string) => {
    const dateObj = new Date(date);
    const newDateTime = new Date(editedEvent.start.dateTime);
    newDateTime.setFullYear(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    handleChange('start', {
      ...editedEvent.start,
      dateTime: newDateTime.toISOString(),
    });
    setShowStartDatePicker(false);
  };

  /**
   * Handle start time change
   */
  const handleStartTimeChange = (time: string) => {
    const timeObj = new Date(time);
    const newDateTime = new Date(editedEvent.start.dateTime);
    newDateTime.setHours(timeObj.getHours(), timeObj.getMinutes());
    handleChange('start', {
      ...editedEvent.start,
      dateTime: newDateTime.toISOString(),
    });
    setShowStartTimePicker(false);
  };

  /**
   * Handle end date change
   */
  const handleEndDateChange = (date: string) => {
    const dateObj = new Date(date);
    const newDateTime = new Date(editedEvent.end.dateTime);
    newDateTime.setFullYear(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    handleChange('end', {
      ...editedEvent.end,
      dateTime: newDateTime.toISOString(),
    });
    setShowEndDatePicker(false);
  };

  /**
   * Handle end time change
   */
  const handleEndTimeChange = (time: string) => {
    const timeObj = new Date(time);
    const newDateTime = new Date(editedEvent.end.dateTime);
    newDateTime.setHours(timeObj.getHours(), timeObj.getMinutes());
    handleChange('end', {
      ...editedEvent.end,
      dateTime: newDateTime.toISOString(),
    });
    setShowEndTimePicker(false);
  };

  /**
   * Handle save
   */
  const handleSave = () => {
    onSave?.(editedEvent);
  };

  /**
   * Handle cancel
   */
  const handleCancel = () => {
    onClose?.();
  };

  /**
   * Get calendar by ID
   */
  const getSelectedCalendar = () => {
    return calendars.find((cal) => cal.id === editedEvent.calendar);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Pressable onPress={handleCancel} style={styles.headerButton}>
            <Icon name="X" size={24} color={theme.colors.textPrimary} />
          </Pressable>
          <View style={styles.headerSpacer} />
          <Pressable onPress={handleSave} style={styles.headerButton}>
            <Icon name="Check" size={24} color={theme.colors.primary} />
          </Pressable>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title Section */}
          <View style={styles.section}>
            <TextInput
              value={editedEvent.summary}
              onChangeText={(text) => handleChange('summary', text)}
              placeholder="Add title"
              fullWidth
              autoFocus
              inputStyle={styles.titleInput}
            />
          </View>

          {/* Calendar Selection Section */}
          {calendars.length > 0 && (
            <View style={[styles.section, styles.calendarSection]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.calendarChips}
              >
                {calendars.map((calendar) => (
                  <Pressable
                    key={calendar.id}
                    style={[
                      styles.calendarChip,
                      {
                        backgroundColor:
                          calendar.id === editedEvent.calendar
                            ? calendar.backgroundColor
                            : 'transparent',
                        borderColor: calendar.backgroundColor,
                      },
                    ]}
                    onPress={() => handleCalendarSelect(calendar.id)}
                  >
                    <View
                      style={[
                        styles.calendarDot,
                        { backgroundColor: calendar.backgroundColor },
                      ]}
                    />
                    <Text
                      style={[
                        styles.calendarChipText,
                        {
                          color:
                            calendar.id === editedEvent.calendar
                              ? '#ffffff'
                              : theme.colors.textSecondary,
                        },
                      ]}
                    >
                      {calendar.summary}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Time Section */}
          <View style={[styles.section, { borderTopWidth: 1, borderTopColor: theme.colors.border }]}>
            {/* All Day Toggle */}
            <View style={styles.row}>
              <View style={styles.rowContent}>
                <Text style={[styles.rowText, { color: theme.colors.textPrimary }]}>
                  All day
                </Text>
                <Switch
                  value={isAllDay}
                  onValueChange={setIsAllDay}
                  trackColor={{ false: theme.colors.disabled, true: theme.colors.primary }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>

            {/* Start Date & Time */}
            <View style={styles.row}>
              <Icon name="Clock" size={20} color={theme.colors.textSecondary} style={styles.rowIcon} />
              <View style={styles.rowContent}>
                <Pressable onPress={() => setShowStartDatePicker(true)} style={styles.dateTimeButton}>
                  <Text style={[styles.dateTimeText, { color: theme.colors.textPrimary }]}>
                    {formatDateWithWeekday(new Date(editedEvent.start.dateTime))}
                  </Text>
                </Pressable>
                {!isAllDay && (
                  <Pressable onPress={() => setShowStartTimePicker(true)} style={styles.dateTimeButton}>
                    <Text style={[styles.dateTimeText, { color: theme.colors.textPrimary }]}>
                      {formatTime(new Date(editedEvent.start.dateTime))}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* End Date & Time */}
            <View style={styles.row}>
              <Icon name="Clock" size={20} color={theme.colors.textSecondary} style={styles.rowIcon} />
              <View style={styles.rowContent}>
                <Pressable onPress={() => setShowEndDatePicker(true)} style={styles.dateTimeButton}>
                  <Text style={[styles.dateTimeText, { color: theme.colors.textPrimary }]}>
                    {formatDateWithWeekday(new Date(editedEvent.end.dateTime))}
                  </Text>
                </Pressable>
                {!isAllDay && (
                  <Pressable onPress={() => setShowEndTimePicker(true)} style={styles.dateTimeButton}>
                    <Text style={[styles.dateTimeText, { color: theme.colors.textPrimary }]}>
                      {formatTime(new Date(editedEvent.end.dateTime))}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Timezone */}
            <View style={[styles.row, styles.rowNoBorder]}>
              <Icon name="Globe" size={20} color={theme.colors.textSecondary} style={styles.rowIcon} />
              <View style={styles.rowContent}>
                <Text style={[styles.rowText, { color: theme.colors.textSecondary }]}>
                  {editedEvent.start.timeZone || 'Eastern Standard Time'}
                </Text>
              </View>
            </View>

            {/* Repeat (placeholder for now) */}
            <View style={[styles.row, styles.rowNoBorder]}>
              <Icon name="ArrowsClockwise" size={20} color={theme.colors.textSecondary} style={styles.rowIcon} />
              <View style={styles.rowContent}>
                <Text style={[styles.rowText, { color: theme.colors.textSecondary }]}>
                  Does not repeat
                </Text>
              </View>
            </View>
          </View>

          {/* Location Section */}
          <View style={[styles.section, { borderTopWidth: 1, borderTopColor: theme.colors.border }]}>
            <View style={[styles.row, styles.rowNoBorder]}>
              <Icon name="MapPin" size={20} color={theme.colors.textSecondary} style={styles.rowIcon} />
              <View style={[styles.rowContent, { flex: 1 }]}>
                <TextInput
                  value={editedEvent.location || ''}
                  onChangeText={(text) => handleChange('location', text)}
                  placeholder="Add location"
                  fullWidth
                />
              </View>
            </View>
          </View>

          {/* Description Section */}
          <View style={[styles.section, { borderTopWidth: 1, borderTopColor: theme.colors.border }]}>
            <View style={[styles.row, styles.rowNoBorder]}>
              <Icon name="TextAlignLeft" size={20} color={theme.colors.textSecondary} style={styles.rowIcon} />
              <View style={[styles.rowContent, { flex: 1 }]}>
                <TextInput
                  value={editedEvent.description || ''}
                  onChangeText={(text) => handleChange('description', text)}
                  placeholder="Add description"
                  multiline
                  numberOfLines={4}
                  fullWidth
                  inputStyle={styles.descriptionInput}
                />
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date/Time Pickers */}
      {showStartDatePicker && (
        <DatePicker
          value={new Date(editedEvent.start.dateTime)}
          onChange={handleStartDateChange}
          onBlur={() => setShowStartDatePicker(false)}
        />
      )}
      {showStartTimePicker && (
        <TimePicker
          value={new Date(editedEvent.start.dateTime)}
          onChange={handleStartTimeChange}
          onBlur={() => setShowStartTimePicker(false)}
        />
      )}
      {showEndDatePicker && (
        <DatePicker
          value={new Date(editedEvent.end.dateTime)}
          onChange={handleEndDateChange}
          onBlur={() => setShowEndDatePicker(false)}
        />
      )}
      {showEndTimePicker && (
        <TimePicker
          value={new Date(editedEvent.end.dateTime)}
          onChange={handleEndTimeChange}
          onBlur={() => setShowEndTimePicker(false)}
          startTime={new Date(editedEvent.start.dateTime)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: '600',
  },
  calendarSection: {
    paddingVertical: 8,
  },
  calendarChips: {
    flexDirection: 'row',
    gap: 8,
  },
  calendarChip: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  calendarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  calendarChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  rowNoBorder: {
    borderBottomWidth: 0,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowText: {
    fontSize: 16,
  },
  dateTimeButton: {
    paddingVertical: 4,
  },
  dateTimeText: {
    fontSize: 16,
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
});
