import React from 'react';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItemList, DrawerContentComponentProps } from '@react-navigation/drawer';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme';
import { Icon, Logo } from '../components';

// Placeholder screens - will be implemented by other agents
const HomeScreen = () => null;
const SessionHistoryScreen = () => null;
const SettingsScreen = () => null;

export type DrawerParamList = {
  Home: undefined;
  Sessions: undefined;
  Settings: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();

// Custom drawer content with header and sections
function CustomDrawerContent(props: DrawerContentComponentProps) {
  const { theme, isDark, toggleTheme } = useTheme();

  return (
    <DrawerContentScrollView
      {...props}
      style={{ backgroundColor: theme.background }}
    >
      {/* Header with logo and app name */}
      <View style={[styles.drawerHeader, { borderBottomColor: theme.border }]}>
        <Logo size={32} />
        <Text style={[styles.appName, { color: theme.text }]}>DropCal</Text>
      </View>

      {/* Main navigation items */}
      <DrawerItemList {...props} />

      {/* Footer with theme toggle */}
      <View style={[styles.drawerFooter, { borderTopColor: theme.border }]}>
        <TouchableOpacity
          onPress={toggleTheme}
          style={styles.themeToggle}
        >
          <Icon
            name={isDark ? 'Sun' : 'Moon'}
            size={20}
            color={theme.textSecondary}
          />
          <Text style={[styles.themeText, { color: theme.textSecondary }]}>
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </Text>
        </TouchableOpacity>
      </View>
    </DrawerContentScrollView>
  );
}

export default function DrawerNavigator() {
  const { theme } = useTheme();

  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: theme.background,
        },
        headerTintColor: theme.text,
        headerTitleStyle: {
          fontWeight: '600',
        },
        drawerStyle: {
          backgroundColor: theme.background,
          width: 280,
        },
        drawerActiveTintColor: theme.primary,
        drawerInactiveTintColor: theme.textSecondary,
        drawerActiveBackgroundColor: theme.primaryLight,
        drawerItemStyle: {
          borderRadius: 8,
          marginHorizontal: 8,
          marginVertical: 2,
        },
        drawerLabelStyle: {
          fontSize: 16,
          fontWeight: '500',
        },
      }}
    >
      <Drawer.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'DropCal',
          drawerLabel: 'Home',
          drawerIcon: ({ color, size }) => (
            <Icon name="Home" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="Sessions"
        component={SessionHistoryScreen}
        options={{
          title: 'Session History',
          drawerLabel: 'History',
          drawerIcon: ({ color, size }) => (
            <Icon name="Clock" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          drawerLabel: 'Settings',
          drawerIcon: ({ color, size }) => (
            <Icon name="Settings" size={size} color={color} />
          ),
        }}
      />
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  appName: {
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 12,
  },
  drawerFooter: {
    borderTopWidth: 1,
    marginTop: 'auto',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  themeText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 12,
  },
});
