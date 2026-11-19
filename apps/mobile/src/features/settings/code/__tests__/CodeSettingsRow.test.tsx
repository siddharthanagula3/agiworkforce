/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();

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
  FEATURES: { companion: true, connectors: true },
}));

jest.mock('@clerk/expo', () => ({
  useUser: () => ({
    user: { id: 'user_test', primaryEmailAddress: { emailAddress: 'founder@example.com' } },
    isLoaded: true,
  }),
}));

jest.mock('@/src/features/auth/store', () => {
  const state = {
    user: null,
    signOut: jest.fn(),
    isClerkLoaded: true,
    isClerkSignedIn: true,
    clerkUserId: 'user_test',
  };
  const useAuthStore = (selector: (s: typeof state) => unknown) => selector(state);
  useAuthStore.getState = () => state;
  useAuthStore.subscribe = () => () => undefined;
  return { useAuthStore };
});

jest.mock('@/src/features/waitlist/store', () => ({
  useWaitlistStore: (selector: (s: { cloudUnlocked: boolean }) => unknown) =>
    selector({ cloudUnlocked: true }),
}));

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (s: { appMode: string }) => unknown) =>
    selector({ appMode: 'cloud' }),
}));

jest.mock('@/src/features/chat/hooks/useAppModeSwitch', () => ({
  useAppModeSwitch: () => ({
    appMode: 'cloud',
    cloudUnlocked: true,
    switchToLocal: jest.fn(() => true),
    switchToCloud: jest.fn(() => true),
  }),
}));

import SettingsTabScreen from '@/src/features/settings';

describe('AGI Code row in the settings list', () => {
  it('sits in the Assistant group after Capabilities and opens the coding settings page', () => {
    const { getByLabelText, getAllByRole } = render(<SettingsTabScreen />);
    const labels = getAllByRole('button').map((button) => button.props.accessibilityLabel);

    expect(labels.indexOf('AGI Code')).toBe(labels.indexOf('Capabilities') + 1);

    mockPush.mockClear();
    fireEvent.press(getByLabelText('AGI Code'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/code');
  });
});
