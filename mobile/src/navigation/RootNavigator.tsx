import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { useTheme } from '../theme';
import TabNavigator from './TabNavigator';
import { linking } from './linking';

// Placeholder screens - will be implemented by other agents
const SettingsScreen = () => null;
const PlansScreen = () => null;
const EventEditScreen = () => null;
const SignInScreen = () => null;

export type RootStackParamList = {
  Main: undefined;
  Settings: undefined;
  Plans: undefined;
  EventEdit: { eventId?: string };
  SignIn: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

interface RootNavigatorProps {
  isAuthenticated: boolean;
}

export default function RootNavigator({ isAuthenticated }: RootNavigatorProps) {
  const { theme } = useTheme();

  if (!isAuthenticated) {
    return (
      <NavigationContainer linking={linking}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
            cardStyle: { backgroundColor: theme.background },
          }}
        >
          <Stack.Screen name="SignIn" component={SignInScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          cardStyle: { backgroundColor: theme.background },
        }}
      >
        {/* Main Tab Navigator */}
        <Stack.Screen name="Main" component={TabNavigator} />

        {/* Modal Screens */}
        <Stack.Group
          screenOptions={{
            presentation: 'modal',
            cardStyleInterpolator: CardStyleInterpolators.forVerticalIOS,
            headerShown: true,
            headerStyle: {
              backgroundColor: theme.background,
            },
            headerTintColor: theme.text,
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
    </NavigationContainer>
  );
}