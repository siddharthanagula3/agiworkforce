/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Snapshot tests for the Permissions settings screens (R21).
 * Locks the index card structure and a native-backed permission detail against
 * visual regressions.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

// ── Theme mock ────────────────────────────────────────────────────────────────

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

// ── UI component mocks ────────────────────────────────────────────────────────

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

// ── Icon mock ─────────────────────────────────────────────────────────────────

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

// ── Router / navigation mocks ─────────────────────────────────────────────────

let mockPermissionParam = 'camera';

jest.mock('expo-router', () => ({
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
    // Call immediately in test environment so the poll runs once
    const cleanup = cb();
    return cleanup;
  },
}));

// ── Safe area mock ────────────────────────────────────────────────────────────

jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: Record<string, unknown>) => (
      <RN.View {...props}>{children as React.ReactNode}</RN.View>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// ── Expo permission mocks ─────────────────────────────────────────────────────

const undetermined = { status: 'undetermined', canAskAgain: true };

// expo-camera@55 exposes permission functions on the Camera named export, not the module namespace
jest.mock('expo-camera', () => ({
  Camera: {
    getMicrophonePermissionsAsync: jest.fn().mockResolvedValue(undetermined),
    requestMicrophonePermissionsAsync: jest.fn().mockResolvedValue(undetermined),
    getCameraPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
    requestCameraPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
  },
  CameraView: 'CameraView',
}));

// expo-location is not installed in mobile v1 and is not surfaced in settings.

jest.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
  requestPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
}));

jest.mock('expo-contacts', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
  requestPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
}));

// ── Permissions store mock ────────────────────────────────────────────────────

const mockDefaultPerm = { lastObservedStatus: 'undetermined', userIntent: 'denied' };

const mockPermissionsState = {
  permissions: {
    microphone: { ...mockDefaultPerm },
    camera: { ...mockDefaultPerm },
    location: { ...mockDefaultPerm },
    photos: { ...mockDefaultPerm },
    notifications: { ...mockDefaultPerm },
    contacts: { ...mockDefaultPerm },
  },
  setObservedStatus: jest.fn(),
  setUserIntent: jest.fn(),
  getPermission: jest.fn().mockReturnValue(mockDefaultPerm),
};

jest.mock('@/stores/permissionsStore', () => ({
  usePermissionsStore: (sel?: (s: typeof mockPermissionsState) => unknown) =>
    sel ? sel(mockPermissionsState) : mockPermissionsState,
}));

// ── Settings store mock (needed by Switch) ────────────────────────────────────

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (sel?: (s: Record<string, unknown>) => unknown) => {
    const state = { hapticsEnabled: true };
    return sel ? sel(state) : state;
  },
}));

// ── Imports (after all mocks) ─────────────────────────────────────────────────

import PermissionsScreen from '@/src/features/settings/permissions';
import PermissionDetailScreen from '@/src/features/settings/permissions/detail';

// ── Tests ─────────────────────────────────────────────────────────────────────

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
