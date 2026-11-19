/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockAuth = { isClerkLoaded: true, isClerkSignedIn: false };
const mockMode = { appMode: 'local' as 'local' | 'cloud' };

jest.mock('@/stores/connectionStore', () => ({
  useConnectionStore: (selector: (state: { status: string }) => unknown) =>
    selector({ status: 'disconnected' }),
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
    {
      get: (_target, name: string) => {
        if (name === '__esModule') return true;
        return factory(name);
      },
    },
  );
});

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0', ios: { buildNumber: '1' } } },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
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

jest.mock('@/lib/safeOpenURL', () => ({
  openExternalUrl: jest.fn(),
  openInAppBrowser: jest.fn(),
}));

jest.mock('@/lib/v1FeatureFlags', () => ({
  FEATURES: { companion: false, connectors: true },
}));

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: null, isLoaded: true }),
}));

jest.mock('@/src/features/auth/store', () => {
  const useAuthStore = (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth);
  useAuthStore.getState = () => mockAuth;
  useAuthStore.subscribe = () => () => undefined;
  return { useAuthStore };
});

jest.mock('@/src/features/waitlist/store', () => ({
  useWaitlistStore: (selector: (s: { cloudUnlocked: boolean }) => unknown) =>
    selector({ cloudUnlocked: false }),
}));

jest.mock('@/src/features/chat/store/appModeStore', () => {
  const useChatAppModeStore = (selector: (s: typeof mockMode) => unknown) => selector(mockMode);
  useChatAppModeStore.getState = () => mockMode;
  useChatAppModeStore.subscribe = () => () => undefined;
  return { useChatAppModeStore };
});

jest.mock('@/src/features/chat/hooks/useAppModeSwitch', () => ({
  useAppModeSwitch: () => ({
    appMode: mockMode.appMode,
    cloudUnlocked: false,
    switchToLocal: jest.fn(() => true),
    switchToCloud: jest.fn(() => true),
  }),
}));

import SettingsTabScreen from '@/src/features/settings';

const PRIVACY_ROUTE = '/(app)/settings/cloud-privacy';

function rowLabels(getAllByRole: (role: string) => { props: { accessibilityLabel?: string } }[]) {
  return getAllByRole('button').map((button) => button.props.accessibilityLabel);
}

describe('the Privacy row in Settings', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockAuth.isClerkLoaded = true;
    mockAuth.isClerkSignedIn = false;
    mockMode.appMode = 'local';
  });

  it('is there in Local Mode without an account and opens the page without a sign-in step', () => {
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Privacy'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(PRIVACY_ROUTE);
  });

  it('sits in Assistant straight after Data Controls, not among the Cloud rows', () => {
    const { getAllByRole } = render(<SettingsTabScreen />);
    const labels = rowLabels(getAllByRole);

    expect(labels.indexOf('Privacy')).toBe(labels.indexOf('Data Controls') + 1);
    expect(labels).not.toContain('Reflect');
  });

  it('opens straight to the page in Cloud Mode as well, signed in or not', () => {
    mockMode.appMode = 'cloud';
    const { getByLabelText, getAllByRole } = render(<SettingsTabScreen />);
    const labels = rowLabels(getAllByRole);

    expect(labels.indexOf('Privacy')).toBe(labels.indexOf('Data Controls') + 1);
    expect(labels.filter((label) => label === 'Privacy')).toHaveLength(1);
    fireEvent.press(getByLabelText('Privacy'));
    expect(mockPush).toHaveBeenCalledWith(PRIVACY_ROUTE);
  });
});
