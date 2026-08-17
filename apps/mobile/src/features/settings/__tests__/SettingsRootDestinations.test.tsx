/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();

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
    {
      get: (_target, name: string) => {
        if (name === '__esModule') return true;
        return factory(name);
      },
    },
  );
});

jest.mock('expo-router', () => ({
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

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (
    selector: (s: {
      user: null;
      signOut: jest.Mock;
      isClerkLoaded: boolean;
      isClerkSignedIn: boolean;
      clerkUserId: string;
    }) => unknown,
  ) =>
    selector({
      user: null,
      signOut: jest.fn(),
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'user_test',
    }),
}));

jest.mock('@/src/features/waitlist/store', () => ({
  useWaitlistStore: (selector: (s: { cloudUnlocked: boolean }) => unknown) =>
    selector({ cloudUnlocked: true }),
}));

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (s: { appMode: string }) => unknown) =>
    selector({ appMode: 'local' }),
}));

import SettingsTabScreen from '@/src/features/settings';

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
    const duplicates = destinations.filter((d, i) => destinations.indexOf(d) !== i);
    expect(duplicates).toEqual([]);
  });

  it('keeps one billing row that reports the plan instead of a sign-in tag', () => {
    const { getAllByLabelText, queryAllByLabelText } = render(<SettingsTabScreen />);
    expect(queryAllByLabelText(/^Billing/)).toHaveLength(0);
    expect(getAllByLabelText(/^Subscription\./)).toHaveLength(1);
  });
});
