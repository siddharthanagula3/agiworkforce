/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockAccess = { ready: true };

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
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
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : Icon) });
});

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { companion: false } }));

jest.mock('@/src/features/cloud-code/useCloudCodeAccess', () => ({
  useCloudCodeAccess: () => ({
    ready: mockAccess.ready,
    signedIn: true,
    accountKey: 'user_test',
    activate: jest.fn(),
  }),
}));

jest.mock('@/src/features/cloud-code/useCloudCodeSessions', () => ({
  useCloudCodeSessions: () => ({
    status: 'ready',
    availability: null,
    sessions: [],
    runtimes: [],
    error: null,
    refreshing: false,
    load: jest.fn(),
  }),
}));

jest.mock('@/src/features/cloud-code/githubInstall', () => ({
  fetchGitHubInstallations: jest.fn().mockResolvedValue([]),
  disconnectGitHubInstallation: jest.fn(),
  startGitHubInstallInApp: jest.fn(),
}));

import CodeSettingsScreen from '@/src/features/settings/code';
import { useCodePreferences } from '@/src/features/settings/code/store';

describe('AGI Code settings composer group', () => {
  beforeEach(() => {
    mockAccess.ready = true;
    useCodePreferences.setState({ dismissKeyboardAfterSend: false, showContextUsage: true });
  });

  it('lists both switches with today behaviour as their starting position', () => {
    const screen = render(<CodeSettingsScreen />);

    expect(screen.getByText('Composer')).toBeTruthy();
    expect(screen.getByTestId('code-dismiss-keyboard-after-send').props.value).toBe(false);
    expect(screen.getByTestId('code-show-context-usage').props.value).toBe(true);
    expect(screen.getByText('Dismiss keyboard after sending')).toBeTruthy();
    expect(screen.getByText('Show context window usage')).toBeTruthy();
  });

  it('saves each switch to the code preferences', () => {
    const screen = render(<CodeSettingsScreen />);

    fireEvent(screen.getByTestId('code-dismiss-keyboard-after-send'), 'valueChange', true);
    fireEvent(screen.getByTestId('code-show-context-usage'), 'valueChange', false);

    expect(useCodePreferences.getState().dismissKeyboardAfterSend).toBe(true);
    expect(useCodePreferences.getState().showContextUsage).toBe(false);
  });

  it('hides the group where there are no cloud sessions to apply it to', () => {
    mockAccess.ready = false;
    const screen = render(<CodeSettingsScreen />);

    expect(screen.queryByText('Composer')).toBeNull();
  });
});
