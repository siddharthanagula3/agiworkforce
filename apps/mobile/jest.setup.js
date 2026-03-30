/* eslint-disable */
// Fix jest-expo setup.js crash: "Object.defineProperty called on non-object"
// jest-expo@52.x expects UIManager to exist on mockNativeModules before its
// setup runs. This file runs via `setupFiles` (before preset setup) to
// provide the missing global.
const { Animated, NativeModules } = require('react-native');

process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';

if (!NativeModules.UIManager) {
  NativeModules.UIManager = {};
}
if (!NativeModules.UIManager.getViewManagerConfig) {
  NativeModules.UIManager.getViewManagerConfig = () => ({});
}

const SUPPRESSED_WARNINGS = [
  'Attempted to import the module',
  'SafeAreaView has been deprecated',
  'expo-notifications:',
  'expo-background-fetch:',
  '`expo-notifications` functionality',
  '`Background Fetch` functionality',
  '[mmkv] Storage not yet initialized, returning no-op',
  '[OfflineQueue] onSuccess callback error:',
];

const SUPPRESSED_ERRORS = ['An update to Animated(View) inside a test was not wrapped in act(...)'];

const SUPPRESSED_DEBUG = ['[Audit] surface_activity_log insert failed (non-fatal):'];

const originalWarn = console.warn;
console.warn = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (SUPPRESSED_WARNINGS.some((warning) => msg.includes(warning))) {
    return;
  }
  originalWarn(...args);
};

const originalError = console.error;
console.error = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (SUPPRESSED_ERRORS.some((warning) => msg.includes(warning))) {
    return;
  }
  originalError(...args);
};

const originalDebug = console.debug;
console.debug = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (SUPPRESSED_DEBUG.some((warning) => msg.includes(warning))) {
    return;
  }
  originalDebug(...args);
};

const createImmediateAnimation = () => ({
  start: (callback) => callback?.({ finished: true }),
  stop: () => {},
  reset: () => {},
});

Animated.spring = () => createImmediateAnimation();
Animated.timing = () => createImmediateAnimation();

jest.mock('expo-notifications', () => {
  const makeSubscription = () => ({ remove: jest.fn() });

  return {
    __esModule: true,
    AndroidImportance: {
      MAX: 5,
      HIGH: 4,
      DEFAULT: 3,
      MIN: 1,
    },
    PermissionStatus: {
      GRANTED: 'granted',
      DENIED: 'denied',
      UNDETERMINED: 'undetermined',
    },
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[test]' }),
    scheduleNotificationAsync: jest.fn().mockResolvedValue(undefined),
    addNotificationReceivedListener: jest.fn(() => makeSubscription()),
    addNotificationResponseReceivedListener: jest.fn(() => makeSubscription()),
    addPushTokenListener: jest.fn(() => makeSubscription()),
    getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
    setBadgeCountAsync: jest.fn().mockResolvedValue(undefined),
    getBadgeCountAsync: jest.fn().mockResolvedValue(0),
  };
});
