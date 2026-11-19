/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { act, render } from '@testing-library/react-native';

const mockGetPushDeliveryStatus = jest.fn();
const mockAndroidChannelVibrates = jest.fn();
let mockRequestPending = false;

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
}));

jest.mock('@/services/notifications', () => ({
  getPushPermissionStatus: jest.fn().mockResolvedValue('granted'),
  enablePushNotifications: jest.fn().mockResolvedValue('granted'),
  getPushDeliveryStatus: (...args: unknown[]) => mockGetPushDeliveryStatus(...args),
  getPushRegistrationIssue: jest.fn().mockReturnValue(null),
  useNotificationCenter: () => ({ unreadCount: 0 }),
}));

jest.mock('@/services/pushPermissionStatus', () => ({
  ...jest.requireActual('@/services/pushPermissionStatus'),
  isPushPermissionRequestPending: () => mockRequestPending,
}));

jest.mock('@/services/notificationChannels', () => ({
  androidChannelVibrates: (...args: unknown[]) => mockAndroidChannelVibrates(...args),
}));

jest.mock('@/services/preferences', () => ({
  fetchPreferenceNamespace: jest.fn().mockResolvedValue({}),
  savePreferenceNamespace: jest.fn().mockResolvedValue(undefined),
  patchPreferenceNamespace: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return new Proxy({}, { get: (_t, name: string) => (name === '__esModule' ? true : icon) });
});

import NotificationPreferencesScreen from '../src/features/settings/notifications';
import NotificationCategoryDetailScreen from '../src/features/settings/notifications/NotificationCategoryDetailScreen';

const appStateListeners = new Set<(state: AppStateStatus) => void>();
const originalOS = Platform.OS;

async function emitAppState(state: AppStateStatus): Promise<void> {
  await act(async () => {
    for (const listener of [...appStateListeners]) listener(state);
  });
}

beforeEach(() => {
  appStateListeners.clear();
  mockRequestPending = false;
  mockGetPushDeliveryStatus.mockReset().mockResolvedValue('denied');
  mockAndroidChannelVibrates.mockReset().mockResolvedValue(null);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    type: string,
    listener: (state: AppStateStatus) => void,
  ) => {
    if (type === 'change') appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
});

describe('the Notifications screen after a visit to system Settings', () => {
  it('reads the device again when the app comes back, so an allow made in Settings shows', async () => {
    const screen = render(<NotificationPreferencesScreen />);
    expect(await screen.findByText('Your device is blocking notifications')).toBeTruthy();
    expect(screen.getByLabelText('Open Settings')).toBeTruthy();

    mockGetPushDeliveryStatus.mockResolvedValue('granted');
    await emitAppState('background');
    expect(screen.getByText('Your device is blocking notifications')).toBeTruthy();

    await emitAppState('active');

    expect(await screen.findByText('Your device is delivering notifications')).toBeTruthy();
    expect(screen.queryByText('Your device is blocking notifications')).toBeNull();
    expect(screen.queryByLabelText('Open Settings')).toBeNull();
    expect(screen.queryByText('Blocked')).toBeNull();
  });

  it('reads a block made in Settings when the app comes back', async () => {
    mockGetPushDeliveryStatus.mockResolvedValue('granted');
    const screen = render(<NotificationPreferencesScreen />);
    expect(await screen.findByText('Your device is delivering notifications')).toBeTruthy();

    mockGetPushDeliveryStatus.mockResolvedValue('denied');
    await emitAppState('active');

    expect(await screen.findByText('Your device is blocking notifications')).toBeTruthy();
  });

  it('reads the Android channels again on return as well', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
    render(<NotificationPreferencesScreen />);
    await act(async () => {});
    const firstReads = mockAndroidChannelVibrates.mock.calls.length;
    expect(firstReads).toBeGreaterThan(0);

    await emitAppState('active');

    expect(mockAndroidChannelVibrates.mock.calls.length).toBe(firstReads * 2);
  });

  it('leaves the answer to the request itself while the system prompt is closing', async () => {
    const screen = render(<NotificationPreferencesScreen />);
    expect(await screen.findByText('Your device is blocking notifications')).toBeTruthy();
    const reads = mockGetPushDeliveryStatus.mock.calls.length;

    mockRequestPending = true;
    await emitAppState('active');

    expect(mockGetPushDeliveryStatus.mock.calls.length).toBe(reads);
  });

  it('stops listening once the screen is closed', async () => {
    const screen = render(<NotificationPreferencesScreen />);
    expect(await screen.findByText('Your device is blocking notifications')).toBeTruthy();
    const reads = mockGetPushDeliveryStatus.mock.calls.length;

    screen.unmount();
    await emitAppState('active');

    expect(mockGetPushDeliveryStatus.mock.calls.length).toBe(reads);
  });
});

describe('a notification type screen after a visit to system Settings', () => {
  it('reads the device again when the app comes back, so an allow made in Settings shows', async () => {
    const screen = render(<NotificationCategoryDetailScreen category="tasks" />);
    expect(await screen.findByText('This device is blocking notifications.')).toBeTruthy();

    mockGetPushDeliveryStatus.mockResolvedValue('granted');
    await emitAppState('active');

    expect(screen.queryByText('This device is blocking notifications.')).toBeNull();
    expect(screen.queryByLabelText('Open Settings')).toBeNull();
  });

  it('leaves the answer to the request itself while the system prompt is closing', async () => {
    const screen = render(<NotificationCategoryDetailScreen category="tasks" />);
    expect(await screen.findByText('This device is blocking notifications.')).toBeTruthy();
    const reads = mockGetPushDeliveryStatus.mock.calls.length;

    mockRequestPending = true;
    await emitAppState('active');

    expect(mockGetPushDeliveryStatus.mock.calls.length).toBe(reads);
  });

  it('stops listening once the screen is closed', async () => {
    const screen = render(<NotificationCategoryDetailScreen category="tasks" />);
    expect(await screen.findByText('This device is blocking notifications.')).toBeTruthy();
    const reads = mockGetPushDeliveryStatus.mock.calls.length;

    screen.unmount();
    await emitAppState('active');

    expect(mockGetPushDeliveryStatus.mock.calls.length).toBe(reads);
  });
});
