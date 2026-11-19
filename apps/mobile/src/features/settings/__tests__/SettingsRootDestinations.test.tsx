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
  FEATURES: { companion: false, connectors: true },
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

jest.mock('@/src/features/chat/store/appModeStore', () => {
  const state = { appMode: 'cloud' };
  const useChatAppModeStore = (selector: (s: typeof state) => unknown) => selector(state);
  useChatAppModeStore.getState = () => state;
  useChatAppModeStore.subscribe = () => () => undefined;
  return { useChatAppModeStore };
});

jest.mock('@/src/features/chat/hooks/useAppModeSwitch', () => ({
  useAppModeSwitch: () => ({
    appMode: 'cloud',
    cloudUnlocked: true,
    switchToLocal: jest.fn(() => true),
    switchToCloud: jest.fn(() => true),
  }),
}));

import SettingsTabScreen from '@/src/features/settings';

const ROUTES_REACHED_TWICE_ON_PURPOSE: Record<string, number> = {
  '/(app)/about': 2,
  '/(app)/settings/parental-controls': 2,
};

function pressedDestinations() {
  const { getAllByRole } = render(<SettingsTabScreen />);
  mockPush.mockClear();
  for (const button of getAllByRole('button')) fireEvent.press(button);
  return mockPush.mock.calls.map(([target]) =>
    typeof target === 'string' ? target : (target as { pathname: string }).pathname,
  );
}

describe('settings root destinations', () => {
  it('never routes two rows to the same screen', () => {
    const destinations = pressedDestinations();
    const duplicates = [...new Set(destinations)].filter(
      (route) =>
        destinations.filter((d) => d === route).length >
        (ROUTES_REACHED_TWICE_ON_PURPOSE[route] ?? 1),
    );
    expect(duplicates).toEqual([]);
  });

  it('keeps one billing row that reports the plan instead of a sign-in tag', () => {
    const { getAllByLabelText, queryAllByLabelText } = render(<SettingsTabScreen />);
    expect(queryAllByLabelText(/^Billing/)).toHaveLength(0);
    expect(getAllByLabelText(/^Subscription\./)).toHaveLength(1);
  });

  it('names the feedback row with the title of the screen it opens', () => {
    const { getByLabelText, queryByLabelText } = render(<SettingsTabScreen />);
    mockPush.mockClear();
    fireEvent.press(getByLabelText('Report App Issue'));

    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/(app)/feedback' }));
    expect(queryByLabelText('Send Feedback')).toBeNull();
  });

  it('names the device integrations row with the title of the screen it opens', () => {
    const {
      DEVICE_INTEGRATIONS_SCREEN_TITLE,
    } = require('@/src/features/integrations/presentation');
    const { getByLabelText } = render(<SettingsTabScreen />);
    mockPush.mockClear();
    fireEvent.press(getByLabelText('Device Integrations'));

    expect(DEVICE_INTEGRATIONS_SCREEN_TITLE).toBe('Device Integrations');
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/integrations');
  });

  it('opens About from the header button as well as from the Support row', () => {
    const { getByLabelText } = render(<SettingsTabScreen />);
    mockPush.mockClear();
    fireEvent.press(getByLabelText('About AGI'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/about');
  });
});
