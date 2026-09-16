/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

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

jest.mock('@/src/ui/theme', () => ({
  colors: themeColors,
  useTheme: () => ({ colors: themeColors, isDark: true, statusBarStyle: 'light' }),
  useThemeColors: () => themeColors,
}));

jest.mock('@/components/ui/text', () => {
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
  useLocalSearchParams: () => ({ permission: 'camera' }),
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

const cameraStatus = { value: { status: 'undetermined', canAskAgain: true } };

jest.mock('expo-camera', () => ({
  Camera: {
    getMicrophonePermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
    requestMicrophonePermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
    getCameraPermissionsAsync: jest.fn(() => Promise.resolve(cameraStatus.value)),
    requestCameraPermissionsAsync: jest.fn(() => Promise.resolve(cameraStatus.value)),
  },
  CameraView: 'CameraView',
}));

jest.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
}));

jest.mock('expo-calendar', () => ({
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

import PermissionDetailScreen from '@/src/features/settings/permissions/detail';
import { usePermissionsStore } from '@/stores/permissionsStore';
import { PERMISSION_REGISTRY } from '@/src/features/settings/permissions/registry';

function setCameraOsStatus(status: string, canAskAgain = true): void {
  cameraStatus.value = { status, canAskAgain };
}

beforeEach(() => {
  jest.clearAllMocks();
  setCameraOsStatus('undetermined');
  usePermissionsStore.setState({
    permissions: {
      microphone: { lastObservedStatus: 'undetermined' },
      camera: { lastObservedStatus: 'undetermined' },
      photos: { lastObservedStatus: 'undetermined' },
      notifications: { lastObservedStatus: 'undetermined' },
      calendar: { lastObservedStatus: 'undetermined' },
      reminders: { lastObservedStatus: 'undetermined' },
    },
  });
});

describe('MOBILE-011, the permission control cannot contradict the OS', () => {
  it('has no stored access level for the screen to paint from', () => {
    const state = usePermissionsStore.getState() as Record<string, unknown>;
    expect(state).not.toHaveProperty('setUserIntent');
    expect(state.permissions).toEqual(
      expect.objectContaining({ camera: { lastObservedStatus: 'undetermined' } }),
    );
  });

  it('offers no access-level choices, only the two real actions', async () => {
    const { queryByText, findByLabelText } = render(<PermissionDetailScreen />);

    expect(await findByLabelText('Allow Camera')).toBeTruthy();
    for (const fakeLevel of ['Never', 'Ask each time', 'While using the app', 'Always']) {
      expect(queryByText(fakeLevel)).toBeNull();
    }
    expect(queryByText('Access Level')).toBeNull();
  });

  it('reads a never-requested permission as Not Requested, never as Access Denied', async () => {
    const { findByText, queryByText } = render(<PermissionDetailScreen />);

    expect(await findByText('Not Requested')).toBeTruthy();
    expect(queryByText('Access Denied')).toBeNull();
  });

  it('shows the live grant even when the stored status still says denied', async () => {
    usePermissionsStore.setState((s) => ({
      permissions: { ...s.permissions, camera: { lastObservedStatus: 'denied' } },
    }));
    setCameraOsStatus('granted');

    const { findByText, queryByText } = render(<PermissionDetailScreen />);

    expect(await findByText('Access Granted')).toBeTruthy();
    expect(queryByText('Access Denied')).toBeNull();
    await waitFor(() =>
      expect(usePermissionsStore.getState().permissions.camera.lastObservedStatus).toBe('granted'),
    );
  });

  it('sends a refused permission to Settings instead of pretending it can re-ask', async () => {
    setCameraOsStatus('denied', false);

    const { findByText, findByLabelText } = render(<PermissionDetailScreen />);

    expect(await findByText('Access Denied')).toBeTruthy();
    expect(await findByLabelText('Open Settings')).toBeTruthy();
  });

  it('treats an Android soft denial as denied, not as an unasked permission', async () => {
    setCameraOsStatus('denied', true);

    await expect(PERMISSION_REGISTRY.camera.getStatus()).resolves.toBe('denied');

    const { findByText } = render(<PermissionDetailScreen />);
    expect(await findByText('Access Denied')).toBeTruthy();
  });
});
