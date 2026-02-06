import { LinkingOptions } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { RootStackParamList } from './RootNavigator';

const prefix = Linking.createURL('/');

/**
 * Deep linking configuration for DropCal
 *
 * Supported URL patterns:
 * - dropcal://session/:sessionId - Open a specific session
 * - dropcal://event/:eventId - Open event editor for specific event
 * - dropcal://settings - Open settings
 * - dropcal://plans - Open plans
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [prefix, 'dropcal://'],

  config: {
    screens: {
      Main: {
        screens: {
          Home: '',
          Sessions: 'sessions',
          Settings: 'settings',
        },
      },
      Settings: 'settings',
      Plans: 'plans',
      EventEdit: {
        path: 'event/:eventId?',
        parse: {
          eventId: (eventId: string) => eventId || undefined,
        },
      },
      SignIn: 'signin',
    },
  },

  // Optional: Handle custom URL logic
  async getInitialURL() {
    // Check if app was opened from a deep link
    const url = await Linking.getInitialURL();

    if (url != null) {
      return url;
    }

    // Handle notification deep links (if implemented later)
    // const notification = await Notifications.getLastNotificationResponseAsync();
    // return notification?.notification.request.content.data.url;
  },

  subscribe(listener) {
    // Listen to incoming deep links
    const onReceiveURL = ({ url }: { url: string }) => {
      listener(url);
    };

    // Listen to deep links when app is already open
    const subscription = Linking.addEventListener('url', onReceiveURL);

    return () => {
      // Clean up event listener
      subscription.remove();
    };
  },
};

/**
 * Helper functions for creating deep links
 */
export const createDeepLink = {
  session: (sessionId: string) => `dropcal://session/${sessionId}`,
  event: (eventId: string) => `dropcal://event/${eventId}`,
  newEvent: () => 'dropcal://event',
  settings: () => 'dropcal://settings',
  plans: () => 'dropcal://plans',
};

/**
 * Helper to share a session via deep link
 */
export async function shareSession(sessionId: string): Promise<void> {
  const url = createDeepLink.session(sessionId);

  // Using Expo's Linking to share (can be enhanced with expo-sharing later)
  try {
    await Linking.openURL(url);
  } catch (error) {
    console.error('Failed to share session:', error);
  }
}
