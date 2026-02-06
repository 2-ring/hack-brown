/**
 * API configuration for DropCal Mobile.
 * Update this file to configure the backend API URL for your environment.
 */

// TODO: Update this URL to match your backend deployment
// Development: Use your local IP address (not localhost) for physical devices
// Example: http://192.168.1.100:5000
// Production: Use your deployed backend URL
export const API_URL = __DEV__
  ? 'http://localhost:5000'  // Development (iOS simulator/Android emulator)
  : 'https://your-production-api.com';  // Production

// Alternative: Use expo-constants for environment-specific configuration
// import Constants from 'expo-constants';
// export const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:5000';
