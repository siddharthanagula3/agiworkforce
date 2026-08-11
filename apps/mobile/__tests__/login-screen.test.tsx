/* eslint-disable @typescript-eslint/no-require-imports */
import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockUseAuth = jest.fn(() => ({
  isLoaded: true,
  isSignedIn: mockIsSignedIn,
  userId: mockUserId,
}));
let mockSearchParams: { postAuthIntent?: string | string[] } = {};

// Capture the props Clerk's AuthView is rendered with so we can assert the
// app owns dismissal outside the native SwiftUI/Compose touch surface.
let lastAuthViewProps: { mode?: string; isDismissible?: boolean; onDismiss?: () => void } = {};
let mockIsSignedIn = false;
let mockUserId: string | null = null;

jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>Redirect:{href}</Text>,
    useLocalSearchParams: () => mockSearchParams,
    useRouter: () => ({ replace: mockReplace }),
  };
});

jest.mock('@/lib/v1FeatureFlags', () => ({
  FEATURES: { auth: true },
}));

jest.mock('@clerk/expo', () => ({
  useAuth: (options?: { treatPendingAsSignedOut?: boolean }) => mockUseAuth(options),
}));

// AuthView is a native SwiftUI/Compose component; in Jest it has no testable
// tree, so stub it while retaining the props passed across the native boundary.
jest.mock('@clerk/expo/native', () => {
  const { Text } = require('react-native');
  return {
    AuthView: (props: { mode?: string; isDismissible?: boolean; onDismiss?: () => void }) => {
      lastAuthViewProps = props;
      return <Text>AuthView:{props.mode}</Text>;
    },
  };
});

// Hand-listing four tokens meant any component on this screen that reached for
// a fifth got `undefined` and crashed (AgiMark reads `teal` to decide whether
// its accent spoke would be invisible). Use the real dark palette instead.
jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('../src/ui/theme/tokens');
  return { useThemeColors: () => tokens.colors };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

import LoginScreen from '../app/(auth)/login';
import { useAuthStore } from '../src/features/auth/store';
import { useTierStore } from '../src/features/billing/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import {
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultCloudModelIdForTier,
} from '../src/features/model-picker/service';
import { useModelStore } from '../src/features/model-picker/store';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { resetPostAuthDestinationToLocal } from '../src/features/auth/actions/postAuthIntent';
import {
  beginCloudPostAuthIntent,
  clearPostAuthIntent,
  CLOUD_CHAT_POST_AUTH_INTENT,
  peekPostAuthIntent,
  POST_AUTH_INTENT_PARAM,
} from '../src/features/auth/services/postAuthIntent';

function AlreadyLoadedAuthGuardHarness() {
  const [showAuthRoute, setShowAuthRoute] = useState(true);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);

  // Mirrors RootLayout's passive auth guard: an already-loaded signed-in
  // session redirects as soon as the login route commits.
  useEffect(() => {
    if (isClerkSignedIn) setShowAuthRoute(false);
  }, [isClerkSignedIn]);

  return showAuthRoute ? <LoginScreen /> : <Text testID="app-route">App</Text>;
}

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSignedIn = false;
    mockUserId = null;
    mockSearchParams = {};
    clearPostAuthIntent();
    useWaitlistStore.getState().setCloudAccess(false);
    useTierStore.getState().setTier('free');
    useAuthStore.setState({
      isClerkLoaded: false,
      isClerkSignedIn: false,
      clerkUserId: null,
    });
    resetPostAuthDestinationToLocal();
    lastAuthViewProps = {};
  });

  it('renders Clerk native AuthView in combined sign-in-or-up mode', () => {
    const { getByText } = render(<LoginScreen />);

    // Cloud sign-in is the native AuthView, not a web/credential form.
    expect(getByText('AuthView:signInOrUp')).toBeTruthy();
    expect(getByText('One account. Every surface.')).toBeTruthy();
    expect(getByText('Web')).toBeTruthy();
    expect(getByText('Desktop')).toBeTruthy();
    expect(getByText('Mobile')).toBeTruthy();
    expect(lastAuthViewProps.mode).toBe('signInOrUp');
    expect(mockUseAuth).toHaveBeenCalledWith({ treatPendingAsSignedOut: false });
  });

  it('uses a non-overlapping app header to return reliably to Local Mode', () => {
    const { getByTestId } = render(<LoginScreen />);

    expect(getByTestId('cloud-sign-in-header')).toBeTruthy();
    expect(lastAuthViewProps.isDismissible).toBe(false);
    expect(lastAuthViewProps.onDismiss).toBeUndefined();
    fireEvent.press(getByTestId('cloud-sign-in-dismiss'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)');
    expect(peekPostAuthIntent()).toBeNull();
    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
  });

  it('stages the validated route intent for the root Clerk bridge', () => {
    const href = beginCloudPostAuthIntent();
    mockSearchParams = href.params;

    render(<LoginScreen />);

    expect(peekPostAuthIntent()).toBe(CLOUD_CHAT_POST_AUTH_INTENT);
    expect(useChatAppModeStore.getState().appMode).toBe('local');
  });

  it('clears the intent and returns Local when native navigation cancels sign-in', () => {
    const href = beginCloudPostAuthIntent();
    mockSearchParams = href.params;
    const screen = render(<LoginScreen />);

    screen.unmount();

    expect(peekPostAuthIntent()).toBeNull();
    expect(useChatAppModeStore.getState().appMode).toBe('local');
  });

  it('clears stale intent and resets Local for a default login', () => {
    beginCloudPostAuthIntent();

    render(<LoginScreen />);

    expect(peekPostAuthIntent()).toBeNull();
    expect(useChatAppModeStore.getState().appMode).toBe('local');
  });

  it('atomically applies an already-loaded Clerk intent before the auth guard unmounts login', async () => {
    const ownerId = 'fixture-already-loaded-owner';
    mockIsSignedIn = true;
    mockUserId = ownerId;
    mockSearchParams = {
      [POST_AUTH_INTENT_PARAM]: CLOUD_CHAT_POST_AUTH_INTENT,
    };
    useWaitlistStore.getState().setCloudAccess(true);
    useAuthStore.setState({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: ownerId,
    });
    const expectedModelId = getDefaultCloudModelIdForTier(useTierStore.getState().tier);
    expect(expectedModelId).toBeDefined();

    const screen = render(<AlreadyLoadedAuthGuardHarness />);

    await waitFor(() => expect(screen.getByTestId('app-route')).toBeTruthy());
    expect(peekPostAuthIntent()).toBeNull();
    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
    expect(useModelStore.getState().selectedModel).toBe(expectedModelId);
  });
});
