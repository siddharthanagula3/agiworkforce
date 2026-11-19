/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

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

const mockFeatures = { companion: false, connectors: true, imageGen: true };
jest.mock('@/lib/v1FeatureFlags', () => ({
  get FEATURES() {
    return mockFeatures;
  },
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
import { useTierStore } from '@/src/features/billing/store';
import { useChatViewStore } from '@/stores/chat/chatViewStore';

function rowKeys(screen: ReturnType<typeof render>): string[] {
  return screen
    .getAllByTestId(/^settings-row-label-/)
    .map((node) => String(node.props.testID).replace('settings-row-label-', ''));
}

describe('settings root Media and Time and focus rows', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockFeatures.imageGen = true;
    act(() => {
      useChatViewStore.getState().setFeature('imageGen', true);
      useTierStore.setState({ tier: 'pro', grantedCapabilities: ['canUseImages'] } as never);
    });
  });

  it('lists Media under Assistant while image generation is on, and opens the Media page', () => {
    const screen = render(<SettingsTabScreen />);
    const keys = rowKeys(screen);

    expect(keys.indexOf('media')).toBeGreaterThan(keys.indexOf('personalization'));
    expect(keys.indexOf('media')).toBeLessThan(keys.indexOf('data-controls'));
    fireEvent.press(screen.getByLabelText('Media'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/media');
  });

  it('hides Media while image generation is off', () => {
    mockFeatures.imageGen = false;
    const screen = render(<SettingsTabScreen />);

    expect(rowKeys(screen)).not.toContain('media');
    expect(screen.queryByLabelText('Media')).toBeNull();
  });

  it('hides Media on a plan without image creation, where the page would offer nothing', () => {
    act(() => {
      useTierStore.setState({ tier: 'free', grantedCapabilities: [] } as never);
    });
    const screen = render(<SettingsTabScreen />);

    expect(rowKeys(screen)).not.toContain('media');
    fireEvent.changeText(screen.getByLabelText('Search settings'), 'media');
    expect(screen.queryByText('Media')).toBeNull();
  });

  it('hides Media after the person switches image creation off in Capabilities', () => {
    act(() => {
      useChatViewStore.getState().setFeature('imageGen', false);
    });
    const screen = render(<SettingsTabScreen />);

    expect(rowKeys(screen)).not.toContain('media');
  });

  it('lists Time and focus right under Notifications in Device and opens its page', () => {
    const screen = render(<SettingsTabScreen />);
    const keys = rowKeys(screen);

    expect(keys[keys.indexOf('notifications') + 1]).toBe('time-and-focus');
    fireEvent.press(screen.getByLabelText('Time and focus'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/time-and-focus');
  });

  it('finds both pages by search', () => {
    const screen = render(<SettingsTabScreen />);

    fireEvent.changeText(screen.getByLabelText('Search settings'), 'time and');
    expect(screen.getByText('Time and focus')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Search settings'), 'media');
    expect(screen.getByText('Media')).toBeTruthy();
  });
});
