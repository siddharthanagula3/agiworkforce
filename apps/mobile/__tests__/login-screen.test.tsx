/* eslint-disable @typescript-eslint/no-require-imports */
import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  FREE_PLAN_TRAINING_DATA_DISCLOSURE,
  FREE_PLAN_TRAINING_NOTICE_LEAD,
  FREE_PLAN_TRAINING_NOTICE_TAIL,
} from '@agiworkforce/compliance';

const mockReplace = jest.fn();
const mockClerkSetActive = jest.fn(async () => undefined);
const mockUseAuth = jest.fn(() => ({
  isLoaded: true,
  isSignedIn: mockIsSignedIn,
  userId: mockUserId,
}));
const mockSignUpCreate = jest.fn(
  async (): Promise<{ error: { message: string; code?: string } | null }> => ({
    error: null,
  }),
);
const mockSendEmailCode = jest.fn(async (): Promise<{ error: { message: string } | null }> => ({
  error: null,
}));
const mockVerifyEmailCode = jest.fn(async () => ({ error: null }));
const mockFinalizeSignUp = jest.fn(async () => ({ error: null }));
const mockResetSignUp = jest.fn(async () => ({ error: null }));
const mockSignInCreate = jest.fn(
  async (): Promise<{ error: { message: string; code?: string } | null }> => ({ error: null }),
);
const mockSignInPassword = jest.fn(async () => ({ error: null }));
const mockSignInSendCode = jest.fn(async () => ({ error: null }));
const mockSignInVerifyCode = jest.fn(async () => ({ error: null }));
const mockFinalizeSignIn = jest.fn(async () => ({ error: null }));
const mockResetSignIn = jest.fn(async () => ({ error: null }));
const mockSignIn = {
  status: 'needs_identifier',
  supportedFirstFactors: [] as { strategy: string }[],
  create: mockSignInCreate,
  password: mockSignInPassword,
  emailCode: { sendCode: mockSignInSendCode, verifyCode: mockSignInVerifyCode },
  finalize: mockFinalizeSignIn,
  reset: mockResetSignIn,
};
let mockSSOResult: {
  createdSessionId: string | null;
  authSessionResult: { type: string } | null;
  signIn?: { existingSession?: { sessionId: string } | null };
  signUp?: { existingSession?: { sessionId: string } | null };
} = { createdSessionId: null, authSessionResult: null };
const mockStartSSOFlow = jest.fn(async () => mockSSOResult);
const mockStartAppleAuthenticationFlow = jest.fn(async () => ({
  createdSessionId: null as string | null,
  setActive: undefined as jest.Mock | undefined,
}));
const mockAppleAvailable = jest.fn(async () => true);
const mockSignUp = {
  status: 'missing_requirements',
  create: mockSignUpCreate,
  verifications: { sendEmailCode: mockSendEmailCode, verifyEmailCode: mockVerifyEmailCode },
  finalize: mockFinalizeSignUp,
  reset: mockResetSignUp,
};
let mockSearchParams: { postAuthIntent?: string | string[] } = {};

let lastAuthViewProps: { mode?: string; isDismissible?: boolean; onDismiss?: () => void } = {};
let mockIsSignedIn = false;
let mockUserId: string | null = null;
let mockAgeGateConfirmed = true;

jest.mock('@/src/features/auth/services/ageGate', () => ({
  ...jest.requireActual('@/src/features/auth/services/ageGate'),
  isAgeGateConfirmed: () => mockAgeGateConfirmed,
}));

jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  return {
    ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
    Redirect: ({ href }: { href: string }) => <Text>Redirect:{href}</Text>,
    useLocalSearchParams: () => mockSearchParams,
    useRouter: () => ({ replace: mockReplace }),
  };
});

jest.mock('@/lib/v1FeatureFlags', () => ({
  FEATURES: { auth: true },
}));

jest.mock('expo-linking', () => ({
  createURL: (path: string, options?: { queryParams?: Record<string, string> }) => {
    const base = `agiworkforce://${path.replace(/^\//, '')}`;
    const query = new URLSearchParams(options?.queryParams).toString();
    return query ? `${base}?${query}` : base;
  },
}));

jest.mock('@clerk/expo', () => ({
  useAuth: (options?: { treatPendingAsSignedOut?: boolean }) => mockUseAuth(options),
  useClerk: () => ({ setActive: mockClerkSetActive }),
  useSignUp: () => ({ signUp: mockSignUp, fetchStatus: 'idle' }),
  useSignIn: () => ({ signIn: mockSignIn, fetchStatus: 'idle' }),
}));

jest.mock('@clerk/expo/experimental', () => ({
  useSSO: () => ({ startSSOFlow: mockStartSSOFlow }),
}));

jest.mock('@clerk/expo/apple', () => ({
  useSignInWithApple: () => ({ startAppleAuthenticationFlow: mockStartAppleAuthenticationFlow }),
}));

jest.mock('expo-apple-authentication', () => {
  const { Text } = require('react-native');
  return {
    isAvailableAsync: () => mockAppleAvailable(),
    AppleAuthenticationButtonType: { CONTINUE: 1 },
    AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 2 },
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) => (
      <Text testID="mock-apple-button" onPress={onPress}>
        Continue with Apple
      </Text>
    ),
  };
});

jest.mock('@clerk/expo/native', () => {
  const { Text } = require('react-native');
  return {
    AuthView: (props: { mode?: string; isDismissible?: boolean; onDismiss?: () => void }) => {
      lastAuthViewProps = props;
      return <Text>AuthView:{props.mode}</Text>;
    },
  };
});

jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('../src/ui/theme/tokens');
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

import LoginScreen from '../app/(auth)/login';
import { useAuthStore } from '../src/features/auth/store';
import { useTermsAcceptanceStore } from '../src/features/auth/store/termsAcceptanceStore';
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

  useEffect(() => {
    if (isClerkSignedIn) setShowAuthRoute(false);
  }, [isClerkSignedIn]);

  return showAuthRoute ? <LoginScreen /> : <Text testID="app-route">App</Text>;
}

describe('LoginScreen', () => {
  const originalProviderConfig = process.env.EXPO_PUBLIC_AGI_AUTH_PROVIDERS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAgeGateConfirmed = true;
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
    useTermsAcceptanceStore.getState().reset();
    resetPostAuthDestinationToLocal();
    lastAuthViewProps = {};
    mockSignUp.status = 'missing_requirements';
    mockSignIn.status = 'needs_identifier';
    mockSignIn.supportedFirstFactors = [];
    mockSSOResult = { createdSessionId: null, authSessionResult: null };
  });

  afterEach(() => {
    mockAppleAvailable.mockResolvedValue(true);
    if (originalProviderConfig === undefined) {
      delete process.env.EXPO_PUBLIC_AGI_AUTH_PROVIDERS;
    } else {
      process.env.EXPO_PUBLIC_AGI_AUTH_PROVIDERS = originalProviderConfig;
    }
  });

  it('offers a provider-first mobile account creation form matching the website', () => {
    const { getByText, getByTestId } = render(<LoginScreen />);

    expect(getByTestId('mobile-custom-sign-in')).toBeTruthy();
    expect(getByText('Welcome back')).toBeTruthy();
    expect(getByText('AGI')).toBeTruthy();
    expect(getByText('Terms')).toBeTruthy();
    expect(getByText('Privacy')).toBeTruthy();
    expect(getByText('Data use')).toBeTruthy();
    fireEvent.press(getByTestId('cloud-auth-signUp'));
    expect(getByText('Already have an account?')).toBeTruthy();
    expect(getByTestId('cloud-sign-up-data-use')).toBeTruthy();
    expect(
      getByText(
        `${FREE_PLAN_TRAINING_NOTICE_LEAD} ${FREE_PLAN_TRAINING_DATA_DISCLOSURE} ${FREE_PLAN_TRAINING_NOTICE_TAIL}`,
      ),
    ).toBeTruthy();
    expect(getByTestId('mobile-custom-sign-up')).toBeTruthy();
    expect(getByText('Create an account')).toBeTruthy();
    expect(getByTestId('mobile-sign-up-google')).toBeTruthy();
    expect(getByTestId('mobile-sign-up-github')).toBeTruthy();
    expect(getByTestId('mobile-sign-up-email')).toBeTruthy();
    expect(getByTestId('mobile-sign-up-continue')).toBeTruthy();
    fireEvent.press(getByText('Log in'));
    expect(getByTestId('mobile-custom-sign-in')).toBeTruthy();
    expect(getByTestId('cloud-sign-in-header')).toBeTruthy();
    expect(mockUseAuth).toHaveBeenCalledWith({ treatPendingAsSignedOut: false });
  });

  it('rejects malformed email addresses before starting either Clerk flow', async () => {
    const screen = render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('mobile-sign-in-email'), 'not-an-email');
    fireEvent.press(screen.getByTestId('mobile-sign-in-continue'));
    await waitFor(() => expect(screen.getByText('Enter a valid email address.')).toBeTruthy());
    expect(mockSignInCreate).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));
    fireEvent.changeText(screen.getByTestId('mobile-sign-up-email'), 'not-an-email');
    fireEvent.press(screen.getByTestId('mobile-sign-up-continue'));
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(mockSignUpCreate).not.toHaveBeenCalled();
  });

  it('offers the website recovery path when the signup email already has an account', async () => {
    mockSignUpCreate.mockResolvedValueOnce({
      error: { code: 'form_identifier_exists', message: 'Identifier is already taken' },
    });
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));
    fireEvent.changeText(screen.getByTestId('mobile-sign-up-email'), 'person@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-up-continue'));

    await waitFor(() =>
      expect(screen.getByText('This email already has an account.')).toBeTruthy(),
    );
    expect(mockSendEmailCode).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('mobile-sign-up-account-exists-sign-in'));
    expect(screen.getByTestId('mobile-custom-sign-in')).toBeTruthy();
  });

  it('offers account creation when sign-in finds no account for the email', async () => {
    mockSignInCreate.mockResolvedValueOnce({
      error: { code: 'form_identifier_not_found', message: 'Identifier not found' },
    });
    const screen = render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('mobile-sign-in-email'), 'new@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-in-continue'));

    await waitFor(() => expect(screen.getByText('No account uses this email.')).toBeTruthy());
    fireEvent.press(screen.getByTestId('mobile-sign-in-account-missing-sign-up'));
    expect(screen.getByTestId('mobile-custom-sign-up')).toBeTruthy();
  });

  it('continues an email sign-in with a password and finalizes the session', async () => {
    mockSignInCreate.mockImplementationOnce(async () => {
      mockSignIn.status = 'needs_first_factor';
      mockSignIn.supportedFirstFactors = [{ strategy: 'password' }];
      return { error: null };
    });
    mockSignInPassword.mockImplementationOnce(async () => {
      mockSignIn.status = 'complete';
      return { error: null };
    });
    const screen = render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('mobile-sign-in-email'), 'person@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-in-continue'));

    await waitFor(() =>
      expect(mockSignInCreate).toHaveBeenCalledWith({ identifier: 'person@example.com' }),
    );
    await waitFor(() => expect(screen.getByTestId('mobile-sign-in-password')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('mobile-sign-in-password'), 'correct-horse');
    fireEvent.press(screen.getByTestId('mobile-sign-in-submit-password'));

    await waitFor(() =>
      expect(mockSignInPassword).toHaveBeenCalledWith({ password: 'correct-horse' }),
    );
    await waitFor(() => expect(mockFinalizeSignIn).toHaveBeenCalledTimes(1));
  });

  it('sends and verifies an email sign-in code', async () => {
    mockSignInCreate.mockImplementationOnce(async () => {
      mockSignIn.status = 'needs_first_factor';
      mockSignIn.supportedFirstFactors = [{ strategy: 'email_code' }];
      return { error: null };
    });
    mockSignInVerifyCode.mockImplementationOnce(async () => {
      mockSignIn.status = 'complete';
      return { error: null };
    });
    const screen = render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('mobile-sign-in-email'), 'person@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-in-continue'));

    await waitFor(() => expect(mockSignInSendCode).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('mobile-sign-in-code')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('mobile-sign-in-code'), '123456');
    fireEvent.press(screen.getByTestId('mobile-sign-in-submit-code'));

    await waitFor(() => expect(mockSignInVerifyCode).toHaveBeenCalledWith({ code: '123456' }));
    await waitFor(() => expect(mockFinalizeSignIn).toHaveBeenCalledTimes(1));
  });

  it('lets an account with password and email code choose the code on the custom screen', async () => {
    mockSignInCreate.mockImplementationOnce(async () => {
      mockSignIn.status = 'needs_first_factor';
      mockSignIn.supportedFirstFactors = [{ strategy: 'password' }, { strategy: 'email_code' }];
      return { error: null };
    });
    const screen = render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('mobile-sign-in-email'), 'person@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-in-continue'));

    await waitFor(() => expect(screen.getByTestId('mobile-sign-in-password')).toBeTruthy());
    fireEvent.press(screen.getByTestId('mobile-sign-in-use-email-code'));

    await waitFor(() => expect(mockSignInSendCode).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('mobile-sign-in-code')).toBeTruthy());
    expect(mockSignInCreate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('AuthView:signIn')).toBeNull();
  });

  it('retries a failed sign-in code delivery without restarting sign-in', async () => {
    mockSignInCreate.mockImplementationOnce(async () => {
      mockSignIn.status = 'needs_first_factor';
      mockSignIn.supportedFirstFactors = [{ strategy: 'email_code' }];
      return { error: null };
    });
    mockSignInSendCode.mockResolvedValueOnce({ error: { message: 'Email could not be sent' } });
    const screen = render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('mobile-sign-in-email'), 'person@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-in-continue'));

    await waitFor(() =>
      expect(screen.getByText("We couldn't send a code. Try again.")).toBeTruthy(),
    );
    expect(screen.queryByTestId('mobile-sign-in-code')).toBeNull();
    fireEvent.press(screen.getByText('Send a new code'));

    await waitFor(() => expect(mockSignInSendCode).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('mobile-sign-in-code')).toBeTruthy());
    expect(mockSignInCreate).toHaveBeenCalledTimes(1);
  });

  it('hands an MFA sign-in to the native flow', async () => {
    mockSignInCreate.mockImplementationOnce(async () => {
      mockSignIn.status = 'needs_second_factor';
      return { error: null };
    });
    const screen = render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('mobile-sign-in-email'), 'person@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-in-continue'));

    await waitFor(() => expect(screen.getByText('AuthView:signIn')).toBeTruthy());
  });

  it('keeps the entered email and shows a safe sign-in error', async () => {
    mockSignInCreate.mockResolvedValueOnce({
      error: { code: 'form_identifier_not_found', message: 'Account not found at /private/auth' },
    });
    const screen = render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('mobile-sign-in-email'), 'person@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-in-continue'));

    await waitFor(() => expect(screen.getByText('No account uses this email.')).toBeTruthy());
    expect(screen.getByTestId('mobile-sign-in-email').props.value).toBe('person@example.com');
  });

  it('starts social sign-in and keeps the custom form after cancellation', async () => {
    mockSSOResult = {
      createdSessionId: null,
      authSessionResult: { type: 'cancel' },
      signIn: {},
    };
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('mobile-sign-in-google'));

    await waitFor(() =>
      expect(mockStartSSOFlow).toHaveBeenCalledWith({
        strategy: 'oauth_google',
        redirectUrl: expect.any(String),
      }),
    );
    await waitFor(() => expect(screen.queryByText('Opening…')).toBeNull());
    expect(screen.getByTestId('mobile-custom-sign-in')).toBeTruthy();
    expect(screen.queryByText('Sign-in is still loading. Please try again.')).toBeNull();
  });

  it('carries the requested Cloud destination through the social sign-in callback', async () => {
    mockSearchParams = { postAuthIntent: 'cloud-schedules' };
    mockSSOResult = { createdSessionId: null, authSessionResult: { type: 'cancel' } };
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('mobile-sign-in-google'));

    await waitFor(() =>
      expect(mockStartSSOFlow).toHaveBeenCalledWith({
        strategy: 'oauth_google',
        redirectUrl: 'agiworkforce://login?postAuthIntent=cloud-schedules',
      }),
    );
  });

  it('leaves completed social sign-in activation to the experimental SSO hook', async () => {
    mockSSOResult = {
      createdSessionId: 'social-session',
      authSessionResult: { type: 'success' },
    };
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('mobile-sign-in-google'));

    await waitFor(() => expect(mockStartSSOFlow).toHaveBeenCalledTimes(1));
    await act(async () => {
      await mockStartSSOFlow.mock.results[0]?.value;
    });
    await waitFor(() => expect(screen.queryByText('Opening…')).toBeNull());
    expect(mockClerkSetActive).not.toHaveBeenCalled();
    expect(screen.queryByText('AuthView:signIn')).toBeNull();
  });

  it('leaves existing social session activation to the experimental SSO hook', async () => {
    mockSSOResult = {
      createdSessionId: null,
      authSessionResult: { type: 'success' },
      signIn: { existingSession: { sessionId: 'existing-session' } },
    };
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('mobile-sign-in-google'));

    await waitFor(() => expect(mockStartSSOFlow).toHaveBeenCalledTimes(1));
    await act(async () => {
      await mockStartSSOFlow.mock.results[0]?.value;
    });
    await waitFor(() => expect(screen.queryByText('Opening…')).toBeNull());
    expect(mockClerkSetActive).not.toHaveBeenCalled();
    expect(screen.queryByText('AuthView:signIn')).toBeNull();
  });

  it('hands incomplete social sign-in to native authentication', async () => {
    mockSSOResult = {
      createdSessionId: null,
      authSessionResult: { type: 'success' },
      signIn: {},
    };
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('mobile-sign-in-google'));

    await waitFor(() => expect(screen.getByText('AuthView:signIn')).toBeTruthy());
  });

  it('activates a native Apple sign-in session when Apple is configured', async () => {
    process.env.EXPO_PUBLIC_AGI_AUTH_PROVIDERS = 'google,github,apple';
    const setActive = jest.fn(async () => undefined);
    mockStartAppleAuthenticationFlow.mockResolvedValueOnce({
      createdSessionId: 'apple-session',
      setActive,
    });
    const screen = render(<LoginScreen />);

    await waitFor(() => expect(screen.getByTestId('mobile-sign-in-apple')).toBeTruthy());
    fireEvent.press(screen.getByTestId('mock-apple-button'));
    await waitFor(() =>
      expect(setActive).toHaveBeenCalledWith({
        session: 'apple-session',
        navigate: expect.any(Function),
      }),
    );
  });

  it('keeps the sign-in form quiet when Apple authentication is cancelled', async () => {
    process.env.EXPO_PUBLIC_AGI_AUTH_PROVIDERS = 'google,github,apple';
    mockStartAppleAuthenticationFlow.mockRejectedValueOnce({ code: 'ERR_REQUEST_CANCELED' });
    const screen = render(<LoginScreen />);

    await waitFor(() => expect(screen.getByTestId('mobile-sign-in-apple')).toBeTruthy());
    fireEvent.press(screen.getByTestId('mock-apple-button'));
    await waitFor(() => expect(mockStartAppleAuthenticationFlow).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Opening…')).toBeNull());
    expect(screen.queryByText('Could not complete sign-in. Try again.')).toBeNull();
  });

  it('keeps email sign-in available if Apple availability fails', async () => {
    process.env.EXPO_PUBLIC_AGI_AUTH_PROVIDERS = 'apple';
    mockAppleAvailable.mockRejectedValueOnce(new Error('Native availability failed'));
    const screen = render(<LoginScreen />);

    await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
    expect(screen.queryByTestId('mobile-sign-in-apple')).toBeNull();
    expect(screen.getByTestId('mobile-sign-in-email')).toBeTruthy();
  });

  it('creates a legally accepted email sign-up and verifies its code', async () => {
    mockVerifyEmailCode.mockImplementationOnce(async () => {
      mockSignUp.status = 'complete';
      return { error: null };
    });
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));
    fireEvent.changeText(screen.getByTestId('mobile-sign-up-email'), 'person@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-up-continue'));

    await waitFor(() =>
      expect(mockSignUpCreate).toHaveBeenCalledWith({
        emailAddress: 'person@example.com',
        legalAccepted: true,
      }),
    );
    await waitFor(() => expect(screen.getByTestId('mobile-sign-up-code')).toBeTruthy());
    expect(mockSendEmailCode).toHaveBeenCalledTimes(1);
    fireEvent.changeText(screen.getByTestId('mobile-sign-up-code'), '123456');
    fireEvent.press(screen.getByTestId('mobile-sign-up-verify'));
    await waitFor(() => expect(mockVerifyEmailCode).toHaveBeenCalledWith({ code: '123456' }));
    await waitFor(() => expect(mockFinalizeSignUp).toHaveBeenCalledTimes(1));
  });

  it('starts the configured social provider through the future SSO flow', async () => {
    mockSSOResult = {
      createdSessionId: 'session-test',
      authSessionResult: { type: 'success' },
    };
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));
    fireEvent.press(screen.getByTestId('mobile-sign-up-google'));

    await waitFor(() =>
      expect(mockStartSSOFlow).toHaveBeenCalledWith({
        strategy: 'oauth_google',
        redirectUrl: expect.any(String),
      }),
    );
    await waitFor(() => expect(screen.queryByText('Opening…')).toBeNull());
    expect(mockClerkSetActive).not.toHaveBeenCalled();
    expect(screen.queryByText('AuthView:signUp')).toBeNull();
  });

  it('carries the requested Cloud destination through the social sign-up callback', async () => {
    mockSearchParams = { postAuthIntent: 'cloud-models' };
    mockSSOResult = { createdSessionId: null, authSessionResult: { type: 'cancel' } };
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));
    fireEvent.press(screen.getByTestId('mobile-sign-up-google'));

    await waitFor(() =>
      expect(mockStartSSOFlow).toHaveBeenCalledWith({
        strategy: 'oauth_google',
        redirectUrl: 'agiworkforce://login?postAuthIntent=cloud-models',
      }),
    );
  });

  it('does not reactivate an existing social session from the create-account screen', async () => {
    mockSSOResult = {
      createdSessionId: null,
      authSessionResult: { type: 'success' },
      signUp: { existingSession: { sessionId: 'signup-existing-session' } },
    };
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));
    fireEvent.press(screen.getByTestId('mobile-sign-up-google'));

    await waitFor(() => expect(mockStartSSOFlow).toHaveBeenCalledTimes(1));
    await act(async () => {
      await mockStartSSOFlow.mock.results[0]?.value;
    });
    await waitFor(() => expect(screen.queryByText('Opening…')).toBeNull());
    expect(mockClerkSetActive).not.toHaveBeenCalled();
    expect(screen.queryByText('AuthView:signUp')).toBeNull();
  });

  it('starts only one sign-up flow when provider buttons are tapped together', async () => {
    let finishSSO: ((result: typeof mockSSOResult) => void) | undefined;
    mockStartSSOFlow.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSSO = resolve;
        }),
    );
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));
    act(() => {
      fireEvent.press(screen.getByTestId('mobile-sign-up-google'));
      fireEvent.press(screen.getByTestId('mobile-sign-up-github'));
    });

    expect(mockStartSSOFlow).toHaveBeenCalledTimes(1);
    expect(mockStartSSOFlow).toHaveBeenCalledWith({
      strategy: 'oauth_google',
      redirectUrl: expect.any(String),
    });
    await act(async () =>
      finishSSO?.({ createdSessionId: null, authSessionResult: { type: 'cancel' } }),
    );
    fireEvent.changeText(screen.getByTestId('mobile-sign-up-email'), 'person@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-up-continue'));
    await waitFor(() => expect(mockSignUpCreate).toHaveBeenCalledTimes(1));
  });

  it('offers native Apple sign-up only when configured and available on iOS', async () => {
    process.env.EXPO_PUBLIC_AGI_AUTH_PROVIDERS = 'google,github,apple';
    const setActive = jest.fn(async () => undefined);
    mockStartAppleAuthenticationFlow.mockResolvedValueOnce({
      createdSessionId: 'apple-session',
      setActive,
    });
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));

    await waitFor(() => expect(screen.getByTestId('mobile-sign-up-apple')).toBeTruthy());
    fireEvent.press(screen.getByTestId('mock-apple-button'));
    await waitFor(() => expect(mockStartAppleAuthenticationFlow).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(setActive).toHaveBeenCalledWith({
        session: 'apple-session',
        navigate: expect.any(Function),
      }),
    );
  });

  it('keeps the create-account form quiet when Apple authentication is cancelled', async () => {
    process.env.EXPO_PUBLIC_AGI_AUTH_PROVIDERS = 'google,github,apple';
    mockStartAppleAuthenticationFlow.mockRejectedValueOnce({ code: 'ERR_REQUEST_CANCELED' });
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));

    await waitFor(() => expect(screen.getByTestId('mobile-sign-up-apple')).toBeTruthy());
    fireEvent.press(screen.getByTestId('mock-apple-button'));
    await waitFor(() => expect(mockStartAppleAuthenticationFlow).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Opening…')).toBeNull());
    expect(screen.queryByText('Could not complete sign-up. Try again.')).toBeNull();
  });

  it('keeps email signup usable when configured Apple authentication is unavailable', async () => {
    process.env.EXPO_PUBLIC_AGI_AUTH_PROVIDERS = 'apple';
    mockAppleAvailable.mockResolvedValue(false);
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));

    await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
    expect(screen.queryByTestId('mobile-sign-up-apple')).toBeNull();
    expect(screen.queryByText('OR')).toBeNull();
    expect(screen.getByTestId('mobile-sign-up-email')).toBeTruthy();
  });

  it('keeps the signup form after a cancelled social sign-in', async () => {
    mockSSOResult = {
      createdSessionId: null,
      authSessionResult: { type: 'cancel' },
      signIn: {},
    };
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));
    fireEvent.press(screen.getByTestId('mobile-sign-up-google'));

    await waitFor(() => expect(mockStartSSOFlow).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Opening…')).toBeNull());
    expect(screen.getByTestId('mobile-custom-sign-up')).toBeTruthy();
    expect(screen.queryByText('AuthView:signUp')).toBeNull();
    expect(screen.queryByText('Sign-in is still loading. Please try again.')).toBeNull();
  });

  it('explains when Clerk has not loaded before a social attempt', async () => {
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));
    fireEvent.press(screen.getByTestId('mobile-sign-up-google'));

    await waitFor(() =>
      expect(screen.getByText('Sign-in is still loading. Please try again.')).toBeTruthy(),
    );
    expect(screen.getByTestId('mobile-custom-sign-up')).toBeTruthy();
  });

  it('offers native recovery after a social provider or legal error', async () => {
    mockStartSSOFlow.mockRejectedValueOnce(new Error('Legal acceptance required'));
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));
    fireEvent.press(screen.getByTestId('mobile-sign-up-google'));

    await waitFor(() =>
      expect(screen.getByText('Could not complete sign-up. Try again.')).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId('mobile-sign-up-native-recovery'));
    expect(screen.getByText('AuthView:signUp')).toBeTruthy();
  });

  it('continues incomplete social authentication in the native flow', async () => {
    mockSSOResult = {
      createdSessionId: null,
      authSessionResult: { type: 'success' },
      signIn: {},
    };
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));
    fireEvent.press(screen.getByTestId('mobile-sign-up-google'));

    await waitFor(() => expect(screen.getByText('AuthView:signUp')).toBeTruthy());
  });

  it('keeps the form available after a Clerk sign-up error', async () => {
    mockSignUpCreate.mockResolvedValueOnce({
      error: { code: 'form_identifier_exists', message: 'Email already registered' },
    });
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));
    fireEvent.changeText(screen.getByTestId('mobile-sign-up-email'), 'person@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-up-continue'));

    await waitFor(() =>
      expect(screen.getByText('This email already has an account.')).toBeTruthy(),
    );
    expect(screen.getByTestId('mobile-sign-up-email').props.value).toBe('person@example.com');
    expect(mockSendEmailCode).not.toHaveBeenCalled();
  });

  it('offers a resend path when the first verification email fails', async () => {
    mockSendEmailCode.mockResolvedValueOnce({ error: { message: 'Email could not be sent' } });
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));
    fireEvent.changeText(screen.getByTestId('mobile-sign-up-email'), 'person@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-up-continue'));

    await waitFor(() =>
      expect(screen.getByText("We couldn't send a code. Try again.")).toBeTruthy(),
    );
    expect(screen.getByText(/We couldn't send a code to person@example.com/)).toBeTruthy();
    expect(screen.queryByTestId('mobile-sign-up-code')).toBeNull();
    fireEvent.press(screen.getByText('Send a new code'));
    await waitFor(() => expect(mockSendEmailCode).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('mobile-sign-up-code')).toBeTruthy());
    expect(mockSignUpCreate).toHaveBeenCalledTimes(1);
  });

  it('submits the sign-up email only once while Clerk is processing it', async () => {
    let finishCreate: ((value: { error: null }) => void) | undefined;
    mockSignUpCreate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCreate = resolve;
        }),
    );
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));
    fireEvent.changeText(screen.getByTestId('mobile-sign-up-email'), 'person@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-up-continue'));
    fireEvent.press(screen.getByTestId('mobile-sign-up-continue'));

    expect(mockSignUpCreate).toHaveBeenCalledTimes(1);
    await act(async () => finishCreate?.({ error: null }));
    await waitFor(() => expect(mockSendEmailCode).toHaveBeenCalledTimes(1));
  });

  it('hands incomplete email verification to the native auth flow', async () => {
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('cloud-auth-signUp'));
    fireEvent.changeText(screen.getByTestId('mobile-sign-up-email'), 'person@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-up-continue'));
    await waitFor(() => expect(screen.getByTestId('mobile-sign-up-code')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('mobile-sign-up-code'), '123456');
    fireEvent.press(screen.getByTestId('mobile-sign-up-verify'));

    await waitFor(() => expect(screen.getByText('AuthView:signUp')).toBeTruthy());
  });

  it('uses a non-overlapping app header to return reliably to Local Mode', () => {
    const { getByTestId } = render(<LoginScreen />);

    expect(getByTestId('cloud-sign-in-header')).toBeTruthy();
    fireEvent.press(getByTestId('mobile-sign-in-native-options'));
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

  it('keeps the Cloud destination while the age check interrupts sign-in', () => {
    mockAgeGateConfirmed = false;
    const href = beginCloudPostAuthIntent('cloud-schedules');
    mockSearchParams = href.params;
    const screen = render(<LoginScreen />);

    screen.unmount();

    expect(peekPostAuthIntent()).toBe('cloud-schedules');
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
    useTermsAcceptanceStore.setState({ userId: ownerId, status: 'accepted' });
    const expectedModelId = getDefaultCloudModelIdForTier(useTierStore.getState().tier);
    expect(expectedModelId).toBeDefined();

    const screen = render(<AlreadyLoadedAuthGuardHarness />);

    await waitFor(() => expect(screen.getByTestId('app-route')).toBeTruthy());
    expect(peekPostAuthIntent()).toBeNull();
    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
    expect(useModelStore.getState().selectedModel).toBe(expectedModelId);
  });

  it('keeps a pending Cloud destination in Local Mode until Terms are accepted', () => {
    const ownerId = 'fixture-terms-pending-owner';
    mockIsSignedIn = true;
    mockUserId = ownerId;
    mockSearchParams = { [POST_AUTH_INTENT_PARAM]: CLOUD_CHAT_POST_AUTH_INTENT };
    useWaitlistStore.getState().setCloudAccess(true);
    useTermsAcceptanceStore.setState({
      userId: ownerId,
      status: 'required',
      currentVersion: 'current-policy',
    });

    const screen = render(<LoginScreen />);

    expect(screen.getByTestId('mobile-terms-review')).toBeTruthy();
    expect(peekPostAuthIntent()).toBe(CLOUD_CHAT_POST_AUTH_INTENT);
    expect(useChatAppModeStore.getState().appMode).toBe('local');

    act(() => {
      useTermsAcceptanceStore.setState({ status: 'accepted' });
    });

    expect(peekPostAuthIntent()).toBeNull();
    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
  });

  it('requires an explicit click before recording the current Terms for a signed-in account', () => {
    mockIsSignedIn = true;
    mockUserId = 'person-a';
    const accept = jest.fn();
    const originalAccept = useTermsAcceptanceStore.getState().accept;
    useTermsAcceptanceStore.setState({
      userId: 'person-a',
      status: 'required',
      currentVersion: 'current-policy',
      accept,
    });

    try {
      const screen = render(<LoginScreen />);
      expect(screen.getByTestId('mobile-terms-review').props.contentContainerStyle).toEqual(
        expect.objectContaining({ flexGrow: 1 }),
      );
      expect(
        screen.getByText(
          'Version dated current-policy. Your agreement will be recorded with your account.',
        ),
      ).toBeTruthy();
      expect(screen.getByTestId('mobile-terms-accept').props.accessibilityState).toEqual({
        disabled: true,
      });
      fireEvent.press(screen.getByTestId('mobile-terms-checkbox'));
      fireEvent.press(screen.getByTestId('mobile-terms-accept'));
      expect(accept).toHaveBeenCalledWith('person-a');
    } finally {
      useTermsAcceptanceStore.setState({ accept: originalAccept });
    }
  });

  it('lets a signed-in account leave an unresolved Cloud check for Local Mode', () => {
    mockIsSignedIn = true;
    mockUserId = 'person-a';

    const screen = render(<LoginScreen />);

    expect(screen.getByTestId('cloud-sign-in-completing')).toBeTruthy();
    expect(screen.getByText('Checking your AGI Cloud access…')).toBeTruthy();
    fireEvent.press(screen.getByText('Continue in Local Mode'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)');
    expect(useChatAppModeStore.getState().appMode).toBe('local');
  });

  it('requires a fresh confirmation when the account or Terms version changes', () => {
    mockIsSignedIn = true;
    mockUserId = 'person-a';
    const accept = jest.fn();
    const originalAccept = useTermsAcceptanceStore.getState().accept;
    useTermsAcceptanceStore.setState({
      userId: 'person-a',
      status: 'required',
      currentVersion: 'first-policy',
      accept,
    });

    try {
      const screen = render(<LoginScreen />);
      fireEvent.press(screen.getByTestId('mobile-terms-checkbox'));
      expect(screen.getByTestId('mobile-terms-accept').props.accessibilityState.disabled).toBe(
        false,
      );

      mockUserId = 'person-b';
      act(() => {
        useTermsAcceptanceStore.setState({ userId: 'person-b', currentVersion: 'first-policy' });
        screen.rerender(<LoginScreen />);
      });
      expect(screen.getByTestId('mobile-terms-checkbox').props.accessibilityState.checked).toBe(
        false,
      );
      expect(screen.getByTestId('mobile-terms-accept').props.accessibilityState.disabled).toBe(
        true,
      );
      fireEvent.press(screen.getByTestId('mobile-terms-accept'));
      expect(accept).not.toHaveBeenCalled();

      fireEvent.press(screen.getByTestId('mobile-terms-checkbox'));
      act(() => {
        useTermsAcceptanceStore.setState({ currentVersion: 'second-policy' });
      });
      expect(screen.getByTestId('mobile-terms-checkbox').props.accessibilityState.checked).toBe(
        false,
      );
      expect(screen.getByTestId('mobile-terms-accept').props.accessibilityState.disabled).toBe(
        true,
      );
      fireEvent.press(screen.getByTestId('mobile-terms-accept'));
      expect(accept).not.toHaveBeenCalled();
    } finally {
      useTermsAcceptanceStore.setState({ accept: originalAccept });
    }
  });
});
