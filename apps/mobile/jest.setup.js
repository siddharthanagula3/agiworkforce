/* eslint-disable */
// Fix jest-expo setup.js crash: "Object.defineProperty called on non-object"
// jest-expo@52.x expects UIManager to exist on mockNativeModules before its
// setup runs. This file runs via `setupFiles` (before preset setup) to
// provide the missing global.
const { Animated, NativeModules } = require('react-native');

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
  'expo-background-task:',
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

jest.mock('react-native-worklets', () => {
  const createMockProxy = () => {
    const dummy = () => {};
    return new Proxy(dummy, {
      get(target, prop) {
        if (prop === '__esModule') return true;
        return createMockProxy();
      },
      apply() {
        return createMockProxy();
      },
    });
  };
  return createMockProxy();
});

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.useReducedMotion = () => false;
  Reanimated.useSharedValue = (initial) => ({ value: initial });
  Reanimated.useAnimatedStyle = (fn) => fn();
  Reanimated.useDerivedValue = (fn) => ({ value: fn() });
  Reanimated.withTiming = (toValue) => toValue;
  Reanimated.withSpring = (toValue) => toValue;
  Reanimated.runOnJS = (fn) => fn;
  Reanimated.runOnUI = (fn) => fn;
  return Reanimated;
});

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
    DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
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

// react-native-webview pulls in a native TurboModule (RNCWebViewModule) that is
// not registered in the jest binary. Mock it to a plain View so components that
// render a WebView (MathBlock, SafeArtifactPreview, ArtifactFullScreen) can be
// imported and rendered in unit tests.
jest.mock('react-native-webview', () => {
  const WebView = require('react-native').View;
  return { __esModule: true, WebView, default: WebView };
});

// expo-speech-recognition ships untranspiled TS and touches native modules at
// import time, so any suite that reaches it fails to LOAD rather than fail a
// test. That failure mode is quiet: the suite contributes 0 tests, the run
// total silently drops, and the summary still reads "passed". It surfaced when
// the chat tab began importing useVoiceConversation for inline voice mode —
// chat-tab-mode-toggle's 12 tests vanished without a visible failure.
jest.mock('expo-speech-recognition', () => ({
  __esModule: true,
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    supportsOnDeviceRecognition: jest.fn().mockReturnValue(true),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  },
  useSpeechRecognitionEvent: jest.fn(),
  addSpeechRecognitionListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// expo-iap requires StoreKit/Play Billing native modules and is unavailable in
// Jest/Expo Go. Individual billing tests override these spies to drive purchase
// and restore callbacks without making a real store call.
jest.mock('expo-iap', () => ({
  __esModule: true,
  useIAP: jest.fn(() => ({
    connected: false,
    products: [],
    subscriptions: [],
    availablePurchases: [],
    activeSubscriptions: [],
    fetchProducts: jest.fn().mockResolvedValue(undefined),
    requestPurchase: jest.fn().mockResolvedValue(null),
    finishTransaction: jest.fn().mockResolvedValue(undefined),
    getAvailablePurchases: jest.fn().mockResolvedValue(undefined),
    restorePurchases: jest.fn().mockResolvedValue(undefined),
    getActiveSubscriptions: jest.fn().mockResolvedValue(undefined),
    hasActiveSubscriptions: jest.fn().mockResolvedValue(false),
    reconnect: jest.fn().mockResolvedValue(false),
  })),
}));
