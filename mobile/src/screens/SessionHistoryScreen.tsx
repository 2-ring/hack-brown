import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  Pressable,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { Icon, Skeleton, PhosphorIconName } from '../components';
import { useTheme } from '../theme';

type InputType = 'image' | 'document' | 'audio' | 'text' | 'link' | 'email';

interface SessionListItem {
  id: string;
  title: string;
  timestamp: Date;
  eventCount: number;
  status: 'idle' | 'loading' | 'error' | 'complete';
  inputType: InputType;
}

interface SessionSection {
  title: string;
  data: SessionListItem[];
}

interface SessionHistoryScreenProps {
  sessions?: SessionListItem[];
  currentSessionId?: string;
  isLoading?: boolean;
  onSessionClick?: (sessionId: string) => void;
  onRefresh?: () => void;
}

/**
 * Get icon name for input type
 */
const getInputIcon = (inputType: InputType): PhosphorIconName => {
  switch (inputType) {
    case 'image':
      return 'Image';
    case 'document':
      return 'File';
    case 'audio':
      return 'Microphone';
    case 'text':
      return 'Pen';
    case 'link':
      return 'Link';
    case 'email':
      return 'Envelope';
    default:
      return 'File';
  }
};

/**
 * Group sessions by time period
 */
const groupSessionsByTime = (sessions: SessionListItem[]): SessionSection[] => {
  const now = new Date();
  const groups: { [key: string]: SessionListItem[] } = {
    'Today': [],
    'Yesterday': [],
    '7 Days': [],
    '30 Days': [],
    'Older': [],
  };

  sessions.forEach((session) => {
    const daysDiff = Math.floor(
      (now.getTime() - session.timestamp.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff === 0) {
      groups['Today'].push(session);
    } else if (daysDiff === 1) {
      groups['Yesterday'].push(session);
    } else if (daysDiff <= 7) {
      groups['7 Days'].push(session);
    } else if (daysDiff <= 30) {
      groups['30 Days'].push(session);
    } else {
      groups['Older'].push(session);
    }
  });

  // Convert to array and remove empty groups
  return Object.entries(groups)
    .filter(([_, sessions]) => sessions.length > 0)
    .map(([title, data]) => ({ title, data }));
};

/**
 * SessionHistoryScreen - Display session history grouped by time
 * Task 39: Create SessionHistory Screen
 */
export function SessionHistoryScreen({
  sessions = [],
  currentSessionId,
  isLoading = false,
  onSessionClick,
  onRefresh,
}: SessionHistoryScreenProps) {
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Handle session click
   */
  const handleSessionClick = useCallback(
    (sessionId: string) => {
      onSessionClick?.(sessionId);
    },
    [onSessionClick]
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
   * Group sessions
   */
  const groupedSessions = groupSessionsByTime(sessions);

  /**
   * Render section header
   */
  const renderSectionHeader = useCallback(
    ({ section }: { section: SessionSection }) => (
      <View style={[styles.sectionHeader, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.sectionHeaderText, { color: theme.colors.textSecondary }]}>
          {section.title}
        </Text>
      </View>
    ),
    [theme]
  );

  /**
   * Render session item
   */
  const renderItem = useCallback(
    ({ item }: { item: SessionListItem }) => {
      const isActive = item.id === currentSessionId;
      const iconName = getInputIcon(item.inputType);

      return (
        <Pressable
          style={({ pressed }) => [
            styles.sessionItem,
            {
              backgroundColor: isActive
                ? theme.colors.primaryLight || `${theme.colors.primary}15`
                : theme.colors.surface,
              borderColor: isActive ? theme.colors.primary : theme.colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          onPress={() => handleSessionClick(item.id)}
        >
          <View style={styles.sessionIconContainer}>
            <Icon
              name={iconName}
              size={18}
              color={isActive ? theme.colors.primary : theme.colors.textSecondary}
            />
          </View>

          <View style={styles.sessionContent}>
            <Text
              style={[
                styles.sessionTitle,
                { color: theme.colors.textPrimary },
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
          </View>

          {item.eventCount > 0 && (
            <View
              style={[
                styles.eventCountBadge,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text style={styles.eventCountText}>{item.eventCount}</Text>
            </View>
          )}
        </Pressable>
      );
    },
    [currentSessionId, theme, handleSessionClick]
  );

  /**
   * Render loading state
   */
  const renderLoadingState = () => {
    return (
      <View style={styles.loadingContainer}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((_, index) => (
          <View key={`skeleton-${index}`} style={styles.skeletonItem}>
            <Skeleton />
          </View>
        ))}
      </View>
    );
  };

  /**
   * Render empty state
   */
  const renderEmptyState = () => {
    if (isLoading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Icon
          name="Clock"
          size={64}
          color={theme.colors.textSecondary}
          style={styles.emptyIcon}
        />
        <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>
          No Sessions Yet
        </Text>
        <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
          Drop files or text to get started
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Icon name="Clock" size={24} color={theme.colors.primary} />
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>
          History
        </Text>
        <View style={styles.headerRight} />
      </View>

      {/* Session List */}
      {isLoading && sessions.length === 0 ? (
        renderLoadingState()
      ) : (
        <SectionList
          sections={groupedSessions}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            groupedSessions.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={renderEmptyState}
          stickySectionHeadersEnabled={true}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 24,
  },
  listContent: {
    paddingBottom: 20,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  sectionHeader: {
    paddingLeft: 32,
    paddingRight: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  sessionIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionContent: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  eventCountBadge: {
    minWidth: 24,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventCountText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    padding: 16,
  },
  skeletonItem: {
    marginBottom: 8,
  },
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
});
