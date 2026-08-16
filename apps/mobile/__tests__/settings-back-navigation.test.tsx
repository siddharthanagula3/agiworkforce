/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * PAR-M15 — settings sub-screens must pop the stack they were pushed from.
 *
 * Voice, Permissions and Notification Preferences are each reachable from more
 * than one parent (the Settings root, Safety & Security, and Capabilities), so
 * a hard `navigate` to one fixed parent dropped the user on a screen they never
 * came from — backing out of Permissions opened from Capabilities landed on
 * Safety & Security. All three now use SettingsScreenShell, which pops the real
 * stack and keeps `backHref` only for deep-linked entries with no history.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy(
    {},
    {
      get: (_target, name) => (name === '__esModule' ? true : icon),
    },
  );
});

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store?.persist?.rehydrate) store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@react-native-community/slider', () => ({
  __esModule: true,
  default: ({ accessibilityLabel }: { accessibilityLabel?: string }) => {
    const { View } = require('react-native') as typeof import('react-native');
    return <View accessibilityLabel={accessibilityLabel} accessibilityRole="adjustable" />;
  },
}));

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

jest.mock('../src/features/memory/store', () => ({
  useMemoryStore: (
    selector: (state: { entries: unknown[]; fetchMemories: () => Promise<void> }) => unknown,
  ) => selector({ entries: [], fetchMemories: jest.fn(async () => undefined) }),
}));

import CapabilitiesScreen from '../src/features/settings/capabilities';
import NotificationPreferencesScreen from '../src/features/settings/notifications';
import PermissionsScreen from '../src/features/settings/permissions';
import VoiceSettingsScreen from '../src/features/settings/voice';

const SUB_SCREENS: Array<{
  name: string;
  Screen: () => React.JSX.Element;
  deepLinkFallback: string;
}> = [
  { name: 'Voice', Screen: VoiceSettingsScreen, deepLinkFallback: '/(app)/(tabs)/settings' },
  {
    name: 'Permissions',
    Screen: PermissionsScreen,
    deepLinkFallback: '/(app)/settings/safety-security',
  },
  {
    name: 'Notification Preferences',
    Screen: NotificationPreferencesScreen,
    deepLinkFallback: '/(app)/(tabs)/settings',
  },
];

describe('settings sub-screen back navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('reaches Permissions and Voice from Capabilities, so their parent is not fixed', () => {
    const { getByLabelText } = render(<CapabilitiesScreen />);

    fireEvent.press(
      getByLabelText('Camera and files. Review camera, microphone, photo, and file access'),
    );
    fireEvent.press(getByLabelText('Voice. Adjust local voice input and speech output'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/permissions');
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/voice');
  });

  describe.each(SUB_SCREENS)('$name', ({ Screen, deepLinkFallback }) => {
    it('pops back to whichever screen pushed it', () => {
      const { getByLabelText } = render(<Screen />);

      fireEvent.press(getByLabelText('Go back'));

      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it(`falls back to ${deepLinkFallback} only when there is no history`, () => {
      mockCanGoBack.mockReturnValue(false);
      const { getByLabelText } = render(<Screen />);

      fireEvent.press(getByLabelText('Go back'));

      expect(mockNavigate).toHaveBeenCalledWith(deepLinkFallback);
      expect(mockBack).not.toHaveBeenCalled();
    });
  });
});
