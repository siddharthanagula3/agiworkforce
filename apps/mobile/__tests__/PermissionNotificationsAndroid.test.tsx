/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';

const themeColors = {
  textPrimary: '#fff',
  textSecondary: '#aaa',
  textMuted: '#777',
  border: '#333',
  teal: '#2dd4bf',
  background: '#0e0e0e',
  surfaceBase: '#0e0e0e',
  surfaceElevated: '#1a1a1a',
  successBorder: '#0f766e',
  successSurface: '#052e2b',
  neutralSurface: '#222',
};

jest.mock('@/src/features/chat/components/WorkModeSwitch', () => ({ HEADER_TEXT_SCALE_LIMIT: 2 }));
jest.mock('@/src/ui/theme', () => ({
  colors: themeColors,
  useTheme: () => ({ colors: themeColors, isDark: true, statusBarStyle: 'light' }),
  useThemeColors: () => themeColors,
}));

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const factory = (name: string) => (props: Record<string, unknown>) => (
    <RN.View testID={`icon-${name}`} {...props} />
  );
  return new Proxy(
    {},
    { get: (_t, name: string) => (name === '__esModule' ? true : factory(name)) },
  );
});

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({ permission: 'notifications' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: Record<string, unknown>) => (
      <RN.View {...props}>{children as React.ReactNode}</RN.View>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

const notificationAnswer: { value: Record<string, unknown> } = {
  value: { status: 'undetermined', canAskAgain: true, granted: false },
};

jest.mock('expo-camera', () => ({
  Camera: {
    getMicrophonePermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
    requestMicrophonePermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
    getCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
    requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
  },
  CameraView: 'CameraView',
}));

jest.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
}));

jest.mock('expo-notifications', () => ({
  ...jest.requireActual('@/__mocks__/expo-notifications.mock').expoNotificationsMock(),
  getPermissionsAsync: jest.fn(() => Promise.resolve(notificationAnswer.value)),
  requestPermissionsAsync: jest.fn(() => Promise.resolve(notificationAnswer.value)),
}));

jest.mock('expo-calendar/legacy', () => ({
  getCalendarPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
  requestCalendarPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
  getRemindersPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
  requestRemindersPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
}));

jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import PermissionDetailScreen from '@/src/features/settings/permissions/Detail';
import {
  PERMISSION_REGISTRY,
  permissionStatusLabel,
} from '@/src/features/settings/permissions/registry';

const originalOS = Platform.OS;

function setPlatform(os: 'ios' | 'android'): void {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
}

function answerNotifications(status: string, canAskAgain: boolean): void {
  notificationAnswer.value = { status, canAskAgain, granted: status === 'granted' };
}

beforeEach(() => {
  jest.clearAllMocks();
  answerNotifications('undetermined', true);
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
});

describe('Android notifications read the way the other notification screens read them', () => {
  beforeEach(() => setPlatform('android'));

  it('reads a never-asked permission as undetermined and labels the row Ask', async () => {
    answerNotifications('denied', true);

    const status = await PERMISSION_REGISTRY.notifications.getStatus();

    expect(status).toBe('undetermined');
    expect(permissionStatusLabel(status, 'notifications')).toBe('Ask');
  });

  it('offers the request button on the detail screen instead of Settings only', async () => {
    answerNotifications('denied', true);

    const { findByText, findByLabelText, queryByText, queryByLabelText } = render(
      <PermissionDetailScreen />,
    );

    expect(await findByText('Not Allowed Yet')).toBeTruthy();
    expect(queryByText('Not Requested')).toBeNull();
    expect(await findByLabelText('Allow Notifications')).toBeTruthy();
    expect(queryByText('Access Denied')).toBeNull();
    expect(queryByLabelText('Open Settings')).toBeNull();
  });

  it('reads a permission the system stopped asking about as denied, Settings only', async () => {
    answerNotifications('denied', false);

    await expect(PERMISSION_REGISTRY.notifications.getStatus()).resolves.toBe('denied');

    const { findByText, findByLabelText, queryByLabelText } = render(<PermissionDetailScreen />);
    expect(await findByText('Access Denied')).toBeTruthy();
    expect(await findByLabelText('Open Settings')).toBeTruthy();
    expect(queryByLabelText('Allow Notifications')).toBeNull();
  });

  it('reads a grant as granted', async () => {
    answerNotifications('granted', true);

    await expect(PERMISSION_REGISTRY.notifications.getStatus()).resolves.toBe('granted');
  });

  it('keeps the request offered after the first refusal the system still lets the app repeat', async () => {
    answerNotifications('denied', true);

    await expect(PERMISSION_REGISTRY.notifications.requestPermission()).resolves.toBe(
      'undetermined',
    );
  });

  it('reads the second refusal, after which the system stops asking, as denied', async () => {
    answerNotifications('denied', false);

    await expect(PERMISSION_REGISTRY.notifications.requestPermission()).resolves.toBe('denied');
  });
});

describe('iOS notifications', () => {
  beforeEach(() => setPlatform('ios'));

  it('keeps a denied answer denied whatever canAskAgain says', async () => {
    answerNotifications('denied', true);

    await expect(PERMISSION_REGISTRY.notifications.getStatus()).resolves.toBe('denied');
    await expect(PERMISSION_REGISTRY.notifications.requestPermission()).resolves.toBe('denied');
  });

  it('reads an unasked permission as undetermined', async () => {
    answerNotifications('undetermined', true);

    await expect(PERMISSION_REGISTRY.notifications.getStatus()).resolves.toBe('undetermined');
  });

  it('keeps the Not Requested headline for an unasked permission', async () => {
    answerNotifications('undetermined', true);

    const { findByText, queryByText } = render(<PermissionDetailScreen />);

    expect(await findByText('Not Requested')).toBeTruthy();
    expect(queryByText('Not Allowed Yet')).toBeNull();
  });
});
