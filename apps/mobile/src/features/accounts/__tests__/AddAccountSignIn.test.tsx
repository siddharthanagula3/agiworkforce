/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockIsSignedIn = true;
let mockUserId: string | null = 'user_a';
let mockSearchParams: Record<string, string> = {};
const mockFinalizeSignIn = jest.fn(async () => ({ error: null }));
const mockSignIn = {
  status: 'needs_identifier',
  supportedFirstFactors: [] as { strategy: string }[],
  create: jest.fn(async () => ({ error: null })),
  password: jest.fn(async () => ({ error: null })),
  emailCode: { sendCode: jest.fn(), verifyCode: jest.fn() },
  finalize: mockFinalizeSignIn,
  reset: jest.fn(async () => ({ error: null })),
};

jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  return {
    ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
    Redirect: ({ href }: { href: string }) => <Text>Redirect:{href}</Text>,
    useLocalSearchParams: () => mockSearchParams,
    useRouter: () => ({ replace: mockReplace, back: mockBack, canGoBack: () => true }),
  };
});

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { auth: true } }));

jest.mock('expo-linking', () => ({
  createURL: (path: string) => `agiworkforce://${path.replace(/^\//, '')}`,
}));

jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: mockIsSignedIn, userId: mockUserId }),
  useClerk: () => ({ setActive: jest.fn() }),
  useSignUp: () => ({ signUp: {}, fetchStatus: 'idle' }),
  useSignIn: () => ({ signIn: mockSignIn, fetchStatus: 'idle' }),
}));

jest.mock('@clerk/expo/experimental', () => ({
  useSSO: () => ({ startSSOFlow: jest.fn() }),
}));

jest.mock('@clerk/expo/apple', () => ({
  useSignInWithApple: () => ({ startAppleAuthenticationFlow: jest.fn() }),
}));

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: async () => false,
  AppleAuthenticationButtonType: { CONTINUE: 1 },
  AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 2 },
  AppleAuthenticationButton: () => null,
}));

jest.mock('@clerk/expo/native', () => {
  const { Text } = require('react-native');
  return { AuthView: ({ mode }: { mode?: string }) => <Text>AuthView:{mode}</Text> };
});

jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    useThemeColors: () => tokens.colors,
    useTheme: () => ({ colors: tokens.colors, isDark: false }),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

import LoginScreen from '@/app/(auth)/login';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useTermsAcceptanceStore } from '@/src/features/auth/store/termsAcceptanceStore';
import {
  beginCloudAccountAddition,
  endCloudAccountAddition,
  isCloudAccountAdditionOpenFor,
} from '@/src/features/auth/services/accountAddition';
import {
  clearPostAuthIntent,
  peekPostAuthIntent,
} from '@/src/features/auth/services/postAuthIntent';

describe('Cloud sign-in in add-account mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSignedIn = true;
    mockUserId = 'user_a';
    mockSearchParams = { addAccount: '1' };
    clearPostAuthIntent();
    endCloudAccountAddition({ cancelled: true });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useTermsAcceptanceStore.setState({ userId: 'user_a', status: 'accepted' });
  });

  it('shows the sign-in form saying it adds an account while the current one stays signed in', () => {
    beginCloudAccountAddition('user_a');

    const { getByText, getByTestId, getByLabelText, queryByTestId } = render(<LoginScreen />);

    expect(getByText('Add an account')).toBeTruthy();
    expect(getByTestId('cloud-add-account-notice')).toBeTruthy();
    expect(getByTestId('mobile-sign-in-email')).toBeTruthy();
    expect(getByLabelText('Close add account').props.accessibilityHint).toBe(
      'Returns to Settings without changing accounts',
    );
    expect(queryByTestId('cloud-sign-in-completing')).toBeNull();
  });

  it('closes without changing the account, the mode or anything staged for it', () => {
    beginCloudAccountAddition('user_a');

    const { getByLabelText } = render(<LoginScreen />);
    act(() => {
      fireEvent.press(getByLabelText('Close add account'));
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
    expect(isCloudAccountAdditionOpenFor('user_a')).toBe(false);
    expect(peekPostAuthIntent()).toBeNull();
  });

  it('continues as the new account once it becomes active', () => {
    beginCloudAccountAddition('user_a');

    const screen = render(<LoginScreen />);
    mockUserId = 'user_b';
    useTermsAcceptanceStore.setState({ userId: 'user_b', status: 'checking' });
    screen.rerender(<LoginScreen />);

    expect(screen.queryByTestId('cloud-add-account-notice')).toBeNull();
    expect(screen.getByTestId('cloud-sign-in-completing')).toBeTruthy();
    expect(peekPostAuthIntent()).toBe('cloud-chat');
    screen.unmount();
    expect(isCloudAccountAdditionOpenFor('user_a')).toBe(false);
  });

  it('ignores an add-account link that Settings did not open', () => {
    const { queryByTestId, getByTestId } = render(<LoginScreen />);

    expect(queryByTestId('cloud-add-account-notice')).toBeNull();
    expect(getByTestId('cloud-sign-in-completing')).toBeTruthy();
  });
});
