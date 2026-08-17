/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@/src/ui/theme', () => ({
  colors: {
    textPrimary: '#fff',
    textSecondary: '#aaa',
    textMuted: '#777',
    border: '#333',
    teal: '#2dd4bf',
    background: '#0e0e0e',
    surfaceBase: '#0e0e0e',
    surfaceElevated: '#1a1a1a',
    surfaceOverlay: '#0e0e0e',
    agentWarning: '#f59e0b',
    agentError: '#ef4444',
  },
  useTheme: () => ({
    colors: {
      textPrimary: '#fff',
      textSecondary: '#aaa',
      textMuted: '#777',
      border: '#333',
      teal: '#2dd4bf',
      background: '#0e0e0e',
      surfaceBase: '#0e0e0e',
      surfaceElevated: '#1a1a1a',
      surfaceOverlay: '#0e0e0e',
      agentWarning: '#f59e0b',
      agentError: '#ef4444',
    },
    isDark: true,
  }),
  useThemeColors: () => ({
    textPrimary: '#fff',
    textSecondary: '#aaa',
    textMuted: '#777',
    border: '#333',
    teal: '#2dd4bf',
    background: '#0e0e0e',
    surfaceBase: '#0e0e0e',
    surfaceElevated: '#1a1a1a',
    surfaceOverlay: '#0e0e0e',
    agentWarning: '#f59e0b',
    agentError: '#ef4444',
  }),
}));

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('@/components/ui/switch', () => {
  const RN = require('react-native');
  return { Switch: (props: Record<string, unknown>) => <RN.Switch {...props} /> };
});

jest.mock('@/components/ui/separator', () => {
  const RN = require('react-native');
  return {
    Separator: (props: Record<string, unknown>) => <RN.View testID="separator" {...props} />,
  };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const factory = (name: string) => (props: Record<string, unknown>) => (
    <RN.View testID={`icon-${name}`} {...props} />
  );
  return new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === '__esModule') return true;
        return factory(name);
      },
    },
  );
});

let mockPermissionParam = 'camera';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({ permission: mockPermissionParam }),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => () => void) => {
    const cleanup = cb();
    return cleanup;
  },
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

const undetermined = { status: 'undetermined', canAskAgain: true };

jest.mock('expo-camera', () => ({
  Camera: {
    getMicrophonePermissionsAsync: jest.fn().mockResolvedValue(undetermined),
    requestMicrophonePermissionsAsync: jest.fn().mockResolvedValue(undetermined),
    getCameraPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
    requestCameraPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
  },
  CameraView: 'CameraView',
}));

jest.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
  requestPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
}));

jest.mock('expo-calendar', () => ({
  getCalendarPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
  requestCalendarPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
  getRemindersPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
  requestRemindersPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
}));

const mockDefaultPerm = { lastObservedStatus: 'undetermined', userIntent: 'denied' };

const mockPermissionsState = {
  permissions: {
    microphone: { ...mockDefaultPerm },
    camera: { ...mockDefaultPerm },
    photos: { ...mockDefaultPerm },
    notifications: { ...mockDefaultPerm },
    calendar: { ...mockDefaultPerm },
    reminders: { ...mockDefaultPerm },
  },
  setObservedStatus: jest.fn(),
  setUserIntent: jest.fn(),
  getPermission: jest.fn().mockReturnValue(mockDefaultPerm),
};

jest.mock('@/stores/permissionsStore', () => ({
  usePermissionsStore: (sel?: (s: typeof mockPermissionsState) => unknown) =>
    sel ? sel(mockPermissionsState) : mockPermissionsState,
}));

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (sel?: (s: Record<string, unknown>) => unknown) => {
    const state = { hapticsEnabled: true };
    return sel ? sel(state) : state;
  },
}));

import PermissionsScreen from '@/src/features/settings/permissions';
import PermissionDetailScreen from '@/src/features/settings/permissions/detail';

beforeEach(() => {
  mockPermissionParam = 'camera';
  jest.clearAllMocks();
});

describe('PermissionsScreen — index', () => {
  it('locks the native-backed permission list card', () => {
    const { toJSON } = render(<PermissionsScreen />);
    expect(toJSON()).toMatchSnapshot();
  });
});

describe('PermissionDetailScreen — camera', () => {
  it('locks the camera detail with native-backed levels', () => {
    const { toJSON } = render(<PermissionDetailScreen />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('fails closed for an unknown permission route param', () => {
    mockPermissionParam = 'nearby-devices';

    const { getByText } = render(<PermissionDetailScreen />);

    expect(getByText('Unknown permission type.')).toBeTruthy();
    expect(mockPermissionsState.setObservedStatus).not.toHaveBeenCalled();
  });
});
