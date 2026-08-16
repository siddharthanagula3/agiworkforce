/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
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
  surfaceOverlay: '#0e0e0e',
  successSurface: '#052e2b',
  neutralSurface: '#222',
  agentSuccess: '#22c55e',
  agentWarning: '#f59e0b',
  agentError: '#ef4444',
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
      get: (_target, name: string) => (name === '__esModule' ? true : factory(name)),
    },
  );
});

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
    navigate: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => (() => void) | undefined) => cb(),
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

jest.mock('expo-contacts', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
  requestPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
}));

jest.mock('expo-calendar', () => ({
  getCalendarPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
  requestCalendarPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
  getRemindersPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
  requestRemindersPermissionsAsync: jest.fn().mockResolvedValue(undetermined),
}));

const mockPermissionsState: {
  permissions: Record<string, { lastObservedStatus: string; userIntent: string }>;
  setObservedStatus: jest.Mock;
  setUserIntent: jest.Mock;
} = {
  permissions: {},
  setObservedStatus: jest.fn(),
  setUserIntent: jest.fn(),
};

jest.mock('@/stores/permissionsStore', () => ({
  usePermissionsStore: (sel?: (s: typeof mockPermissionsState) => unknown) =>
    sel ? sel(mockPermissionsState) : mockPermissionsState,
}));

import PermissionsScreen from '@/src/features/settings/permissions';
import {
  PERMISSION_KINDS,
  PERMISSION_REGISTRY,
  permissionStatusLabel,
} from '@/src/features/settings/permissions/registry';
import { LEVEL_STATUS_LABELS } from '@/src/features/settings/permissions/types';
import type { OsPermissionStatus } from '@/src/features/settings/permissions/types';

function setAllStatuses(status: OsPermissionStatus) {
  mockPermissionsState.permissions = Object.fromEntries(
    PERMISSION_KINDS.map((kind) => [kind, { lastObservedStatus: status, userIntent: 'denied' }]),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  setAllStatuses('undetermined');
});

describe('permissionStatusLabel — OS status → granted level', () => {
  const grantedCases: Array<[string, string]> = [
    ['microphone', 'While using'],
    ['camera', 'While using'],
    ['contacts', 'While using'],
    ['photos', 'Always'],
    ['notifications', 'Always'],
    ['calendar', 'Always'],
    ['reminders', 'Read & write'],
  ];

  it.each(grantedCases)('labels a granted %s as "%s"', (kind, expected) => {
    expect(permissionStatusLabel('granted', kind as never)).toBe(expected);
  });

  it.each(PERMISSION_KINDS)('labels an unasked %s as "Ask"', (kind) => {
    expect(permissionStatusLabel('undetermined', kind)).toBe('Ask');
  });

  it.each(PERMISSION_KINDS)('labels a refused %s as "Never"', (kind) => {
    expect(permissionStatusLabel('denied', kind)).toBe('Never');
  });

  it('keeps "Ask" and "Never" distinct so an unasked permission never reads as refused', () => {
    expect(LEVEL_STATUS_LABELS.ask_each_time).not.toBe(LEVEL_STATUS_LABELS.denied);
    expect(permissionStatusLabel('undetermined', 'camera')).not.toBe(
      permissionStatusLabel('denied', 'camera'),
    );
  });

  it('uses the per-kind override only where the registry declares one', () => {
    expect(PERMISSION_REGISTRY.reminders.levelLabels).toEqual({ allow_always: 'Read & write' });
    expect(PERMISSION_REGISTRY.notifications.levelLabels).toBeUndefined();
    expect(permissionStatusLabel('granted', 'notifications')).toBe(
      LEVEL_STATUS_LABELS.allow_always,
    );
  });

  it('never emits the old On/Ask/Off vocabulary', () => {
    const statuses: OsPermissionStatus[] = ['granted', 'undetermined', 'denied'];
    for (const kind of PERMISSION_KINDS) {
      for (const status of statuses) {
        expect(['On', 'Off']).not.toContain(permissionStatusLabel(status, kind));
      }
    }
  });
});

describe('Location stub removal', () => {
  it('is absent from the registry and the display list', () => {
    expect(PERMISSION_KINDS).not.toContain('location');
    expect(Object.keys(PERMISSION_REGISTRY)).not.toContain('location');
    expect('location' in PERMISSION_REGISTRY).toBe(false);
  });

  it('leaves no adapter that resolves without asking the OS', async () => {
    await Promise.all(
      PERMISSION_KINDS.map(async (kind) => {
        await expect(PERMISSION_REGISTRY[kind].getStatus()).resolves.toBeDefined();
      }),
    );
    const {
      Camera: { getCameraPermissionsAsync },
    } = require('expo-camera');
    expect(getCameraPermissionsAsync).toHaveBeenCalled();
  });
});

describe('PermissionsScreen rows', () => {
  it('renders the granted level and speaks the same string', () => {
    setAllStatuses('granted');

    const { getByLabelText, getAllByText } = render(<PermissionsScreen />);

    expect(
      getByLabelText('Microphone permission. Access level: While using. Tap to manage.'),
    ).toBeTruthy();
    expect(
      getByLabelText('Notifications permission. Access level: Always. Tap to manage.'),
    ).toBeTruthy();
    expect(getAllByText('While using').length).toBeGreaterThan(0);
    expect(getAllByText('Always').length).toBeGreaterThan(0);
  });

  it('reads an unasked permission as Ask and a refused one as Never', () => {
    setAllStatuses('undetermined');
    const asked = render(<PermissionsScreen />);
    expect(
      asked.getByLabelText('Camera permission. Access level: Ask. Tap to manage.'),
    ).toBeTruthy();
    asked.unmount();

    setAllStatuses('denied');
    const refused = render(<PermissionsScreen />);
    expect(
      refused.getByLabelText('Camera permission. Access level: Never. Tap to manage.'),
    ).toBeTruthy();
  });

  it('renders no Location row', () => {
    setAllStatuses('granted');
    const { queryByText } = render(<PermissionsScreen />);
    expect(queryByText('Location')).toBeNull();
  });
});
