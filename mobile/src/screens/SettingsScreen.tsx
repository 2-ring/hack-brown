import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Switch,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Icon, PhosphorIconName } from '../components';
import { useTheme } from '../theme';

interface SettingsScreenProps {
  userEmail?: string;
  userName?: string;
  userAvatar?: string;
  onSignOut?: () => void;
}

/**
 * SettingsScreen - App settings with theme toggle
 * Task 40: Create Settings Screen
 */
export function SettingsScreen({
  userEmail = 'user@example.com',
  userName = 'User',
  userAvatar,
  onSignOut,
}: SettingsScreenProps) {
  const { theme, themeMode, toggleTheme } = useTheme();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  /**
   * Handle sign out
   */
  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => onSignOut?.(),
        },
      ]
    );
  };

  /**
   * Render settings section
   */
  const renderSection = (title: string, children: React.ReactNode) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
        {title}
      </Text>
      <View style={[styles.sectionContent, { backgroundColor: theme.colors.surface }]}>
        {children}
      </View>
    </View>
  );

  /**
   * Render settings item with toggle
   */
  const renderToggleItem = (
    icon: PhosphorIconName,
    label: string,
    value: boolean,
    onValueChange: (value: boolean) => void,
    description?: string
  ) => (
    <View style={styles.settingsItem}>
      <View style={styles.settingsItemLeft}>
        <View style={[styles.iconContainer, { backgroundColor: `${theme.colors.primary}15` }]}>
          <Icon name={icon} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.settingsItemText}>
          <Text style={[styles.settingsItemLabel, { color: theme.colors.textPrimary }]}>
            {label}
          </Text>
          {description && (
            <Text style={[styles.settingsItemDescription, { color: theme.colors.textSecondary }]}>
              {description}
            </Text>
          )}
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.disabled, true: theme.colors.primary }}
        thumbColor="#ffffff"
      />
    </View>
  );

  /**
   * Render settings item with navigation
   */
  const renderNavigationItem = (
    icon: PhosphorIconName,
    label: string,
    value: string,
    onPress: () => void
  ) => (
    <Pressable
      style={({ pressed }) => [
        styles.settingsItem,
        { opacity: pressed ? 0.7 : 1 },
      ]}
      onPress={onPress}
    >
      <View style={styles.settingsItemLeft}>
        <View style={[styles.iconContainer, { backgroundColor: `${theme.colors.primary}15` }]}>
          <Icon name={icon} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.settingsItemText}>
          <Text style={[styles.settingsItemLabel, { color: theme.colors.textPrimary }]}>
            {label}
          </Text>
        </View>
      </View>
      <View style={styles.settingsItemRight}>
        <Text style={[styles.settingsItemValue, { color: theme.colors.textSecondary }]}>
          {value}
        </Text>
        <Icon name="CaretRight" size={16} color={theme.colors.textSecondary} />
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Profile Section */}
        <View style={[styles.profileSection, { backgroundColor: theme.colors.surface }]}>
          <View style={[styles.avatarContainer, { backgroundColor: theme.colors.primary }]}>
            {userAvatar ? (
              <Text style={styles.avatarText}>{userName.charAt(0).toUpperCase()}</Text>
            ) : (
              <Text style={styles.avatarText}>{userName.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: theme.colors.textPrimary }]}>
              {userName}
            </Text>
            <Text style={[styles.profileEmail, { color: theme.colors.textSecondary }]}>
              {userEmail}
            </Text>
          </View>
        </View>

        {/* Appearance Section */}
        {renderSection(
          'APPEARANCE',
          <>
            {renderToggleItem(
              themeMode === 'dark' ? 'Moon' : 'Sun',
              'Dark Mode',
              themeMode === 'dark',
              toggleTheme,
              'Switch between light and dark themes'
            )}
          </>
        )}

        {/* Notifications Section */}
        {renderSection(
          'NOTIFICATIONS',
          <>
            {renderToggleItem(
              'Bell',
              'Push Notifications',
              notificationsEnabled,
              setNotificationsEnabled,
              'Get notified about event reminders'
            )}
          </>
        )}

        {/* Calendar Section */}
        {renderSection(
          'CALENDAR',
          <>
            {renderNavigationItem(
              'Calendar',
              'Default Calendar',
              'Google Calendar',
              () => {
                // TODO: Navigate to calendar selection
                Alert.alert('Calendar Selection', 'Calendar selection coming soon!');
              }
            )}
            {renderNavigationItem(
              'Clock',
              'Timezone',
              'Eastern Time',
              () => {
                // TODO: Navigate to timezone selection
                Alert.alert('Timezone Selection', 'Timezone selection coming soon!');
              }
            )}
          </>
        )}

        {/* About Section */}
        {renderSection(
          'ABOUT',
          <>
            {renderNavigationItem(
              'Info',
              'Version',
              '1.0.0',
              () => {
                // TODO: Show version info
              }
            )}
            {renderNavigationItem(
              'Question',
              'Help & Support',
              '',
              () => {
                // TODO: Navigate to help
                Alert.alert('Help & Support', 'Help documentation coming soon!');
              }
            )}
          </>
        )}

        {/* Sign Out Button */}
        <View style={styles.signOutContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.signOutButton,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            onPress={handleSignOut}
          >
            <Icon name="SignOut" size={20} color="#EF4444" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
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
    paddingBottom: 40,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 32,
    marginBottom: 8,
  },
  sectionContent: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  settingsItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingsItemText: {
    flex: 1,
  },
  settingsItemLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingsItemDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  settingsItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsItemValue: {
    fontSize: 14,
  },
  signOutContainer: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
});
