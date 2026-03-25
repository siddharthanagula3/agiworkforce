/**
 * Suppress known third-party and Expo Go warnings from both the
 * yellow box and the Metro terminal. This file MUST be imported
 * before any other module in the app entry (_layout.tsx).
 */
import { LogBox } from 'react-native';

const SUPPRESSED = [
  'Attempted to import the module',
  'SafeAreaView has been deprecated',
  'expo-notifications:',
  'expo-background-fetch:',
  '`expo-notifications` functionality',
  '`Background Fetch` functionality',
];

LogBox.ignoreLogs(SUPPRESSED);

const _origWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (SUPPRESSED.some((s) => msg.includes(s))) return;
  _origWarn(...args);
};
