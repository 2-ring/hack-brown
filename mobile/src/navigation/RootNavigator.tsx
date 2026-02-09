import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { useTheme } from '../theme';
import { Sidebar } from './Sidebar';
import { linking } from './linking';
import { EventEditScreen, SettingsScreen, HomeScreen, SignInScreen } from '../screens';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { fonts } from '../utils/fonts';
import { AppContainer } from '../AppContainer';
import type { AppContainerRenderProps } from '../AppContainer';

// Placeholder screens - will be implemented by other agents
const PlansScreen = () => null;

export type RootStackParamList = {
  Main: undefined;
  Session: { sessionId: string };
  Settings: undefined;
  Plans: undefined;
  EventEdit: { eventId?: string };
  SignIn: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

interface RootNavigatorProps {
  isAuthenticated: boolean;
}

/**
 * Main navigation wrapper with AppContainer integration
 * This receives ALL state and handlers from AppContainer and passes them to screens
 */
function NavigationContent(containerProps: AppContainerRenderProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts(fonts);

  const {
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
    handleAddSingleEvent,
    handleDeleteEvent,

    // Computed
    menuSessions,
  } = containerProps;

  // Show loading indicator while fonts are loading
  // Temporarily disabled for web debugging
  // if (!fontsLoaded) {
  //   return (
  //     <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
  //       <ActivityIndicator size="large" color={theme.colors.primary} />
  //     </View>
  //   );
  // }

  return (
    <>
      {/* Sidebar Overlay */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={handleSidebarToggle}
        onSessionClick={handleSessionClick}
        onSettings={() => {
          handleSidebarToggle();
          // Navigation will be handled by the screen itself
        }}
        onSignOut={() => {
          handleSidebarToggle();
          // Sign out logic will be handled by auth context
        }}
        sessions={menuSessions}
        currentSessionId={currentSession?.id}
      />

      <View style={{ flex: 1 }}>
        {/* Hamburger Menu Button (Fixed Position) */}
        {!sidebarOpen && (
          <Pressable
            style={[
              styles.menuButton,
              {
                backgroundColor: 'transparent',
                top: insets.top + 16,
                left: insets.left + 16,
              }
            ]}
            onPress={handleSidebarToggle}
          >
            <Logo size={32} />
          </Pressable>
        )}

        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
            cardStyle: { backgroundColor: theme.colors.background },
          }}
        >
          {/* Main Screen (Home) - Pass ALL handlers and state */}
          <Stack.Screen name="Main">
            {() => (
              <HomeScreen
                appState={appState}
                isProcessing={isProcessing}
                calendarEvents={calendarEvents}
                loadingConfig={loadingConfig}
                feedbackMessage={feedbackMessage}
                onFileUpload={handleFileUpload}
                onAudioSubmit={handleAudioSubmit}
                onTextSubmit={handleTextSubmit}
                onClearFile={handleClearFile}
                onAddToCalendar={handleAddToCalendar}
                onAddSingleEvent={handleAddSingleEvent}
                onDeleteEvent={handleDeleteEvent}
                onNewSession={handleNewSession}
              />
            )}
          </Stack.Screen>

          {/* Session Screen (same as Main but for deep linking) */}
          <Stack.Screen name="Session">
            {() => (
              <HomeScreen
                appState={appState}
                isProcessing={isProcessing}
                calendarEvents={calendarEvents}
                loadingConfig={loadingConfig}
                feedbackMessage={feedbackMessage}
                onFileUpload={handleFileUpload}
                onAudioSubmit={handleAudioSubmit}
                onTextSubmit={handleTextSubmit}
                onClearFile={handleClearFile}
                onAddToCalendar={handleAddToCalendar}
                onAddSingleEvent={handleAddSingleEvent}
                onDeleteEvent={handleDeleteEvent}
                onNewSession={handleNewSession}
              />
            )}
          </Stack.Screen>

          {/* Modal Screens */}
          <Stack.Group
            screenOptions={{
              presentation: 'modal',
              cardStyleInterpolator: CardStyleInterpolators.forVerticalIOS,
              headerShown: true,
              headerStyle: {
                backgroundColor: theme.colors.background,
              },
              headerTintColor: theme.colors.textPrimary,
              headerTitleStyle: {
                fontWeight: '600',
              },
            }}
          >
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ title: 'Settings' }}
            />
            <Stack.Screen
              name="Plans"
              component={PlansScreen}
              options={{ title: 'Plans' }}
            />
            <Stack.Screen
              name="EventEdit"
              component={EventEditScreen}
              options={({ route }) => ({
                title: route.params?.eventId ? 'Edit Event' : 'New Event',
              })}
            />
          </Stack.Group>
        </Stack.Navigator>
      </View>
    </>
  );
}

export default function RootNavigator({ isAuthenticated }: RootNavigatorProps) {
  const { theme } = useTheme();
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();

  const handleNavigateToSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    // Navigation will be handled by the stack navigator
  };

  const handleNavigateHome = () => {
    setCurrentSessionId(undefined);
  };

  if (!isAuthenticated) {
    return (
      <NavigationContainer linking={linking}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
            cardStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Screen name="SignIn" component={SignInScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      <AppContainer
        currentSessionId={currentSessionId}
        onNavigateToSession={handleNavigateToSession}
        onNavigateHome={handleNavigateHome}
      >
        {(containerProps) => <NavigationContent {...containerProps} />}
      </AppContainer>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButton: {
    position: 'absolute',
    zIndex: 1001,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});