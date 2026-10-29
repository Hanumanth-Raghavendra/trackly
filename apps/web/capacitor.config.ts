import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android app is the same React build wrapped by Capacitor. Build it with
 * `npm run cap:sync` (uses .env.mobile for absolute API URLs), then open Android Studio
 * with `npm run cap:open`, or let the "Android APK" GitHub Action build it for you.
 */
const config: CapacitorConfig = {
  appId: 'dev.trackly.app',
  appName: 'Trackly',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_trackly',
      iconColor: '#2346D8',
    },
  },
};

export default config;
