import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dropcal.app',
  appName: 'DropCal',
  webDir: 'dist',
  server: {
    // In production, the app loads from the bundled dist/ files.
    // For development, uncomment the url below to load from the Vite dev server:
    // url: 'http://YOUR_LOCAL_IP:5173',
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#1170C5',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
  ios: {
    scheme: 'DropCal',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
