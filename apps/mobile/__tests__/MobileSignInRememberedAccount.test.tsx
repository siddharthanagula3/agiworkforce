import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

type Factor = { strategy: string };
interface MockAttempt {
  status: string;
  supportedFirstFactors: Factor[];
  create: jest.Mock;
  password: jest.Mock;
  reset: jest.Mock;
  finalize: jest.Mock;
  emailCode: { sendCode: jest.Mock; verifyCode: jest.Mock };
}

let mockAttempt: MockAttempt;
let mockClerkEmail: string | undefined;
const mockStartSSOFlow = jest.fn();
const mockStartApple = jest.fn();
let mockAppleAvailable = false;

function makeAttempt(factors: Factor[]): MockAttempt {
  const attempt: MockAttempt = {
    status: 'needs_first_factor',
    supportedFirstFactors: factors,
    create: jest.fn().mockResolvedValue({ error: null }),
    password: jest.fn().mockImplementation(async () => {
      attempt.status = 'complete';
      return { error: null };
    }),
    reset: jest.fn().mockResolvedValue({ error: null }),
    finalize: jest.fn().mockResolvedValue({ error: null }),
    emailCode: {
      sendCode: jest.fn().mockResolvedValue({ error: null }),
      verifyCode: jest.fn().mockResolvedValue({ error: null }),
    },
  };
  return attempt;
}

jest.mock('@clerk/expo', () => ({
  useClerk: () => ({
    user: mockClerkEmail ? { primaryEmailAddress: { emailAddress: mockClerkEmail } } : null,
  }),
  useSignIn: () => ({ signIn: mockAttempt, fetchStatus: 'idle' }),
}));
jest.mock('@clerk/expo/apple', () => ({
  useSignInWithApple: () => ({ startAppleAuthenticationFlow: mockStartApple }),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { plugins: ['expo-apple-authentication'] } },
}));
jest.mock('@clerk/expo/experimental', () => ({
  useSSO: () => ({ startSSOFlow: mockStartSSOFlow }),
}));
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => mockAppleAvailable),
  AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) => {
    const { Pressable } = jest.requireActual('react-native');
    return <Pressable testID="mock-apple-button" onPress={onPress} />;
  },
  AppleAuthenticationButtonType: { CONTINUE: 0 },
  AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 1 },
}));
jest.mock('expo-linking', () => ({ createURL: jest.fn(() => 'agiworkforce://login') }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock('@/lib/safeOpenURL', () => ({ openUntrustedUrlInAppBrowser: jest.fn() }));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  };
});

const mockInstallStore = new Map<string, string>();
jest.mock('@/lib/mmkv', () => ({
  ...jest.requireActual('@/lib/mmkv'),
  whenMmkvReady: (callback: () => void) => callback(),
  storage: {
    getString: (key: string) => mockInstallStore.get(key),
    set: (key: string, value: string) => {
      mockInstallStore.set(key, value);
    },
  },
}));

import * as SecureStore from 'expo-secure-store';
import { MobileSignIn } from '../src/features/auth/components/MobileSignIn';

const secureStore = (SecureStore as unknown as { __store: Map<string, string> }).__store;
const REMEMBERED_KEY = 'agi_remembered_account_v1';
const INSTALL_MARKER_KEY = 'agi_remembered_account_install_v1';

function seedRemembered(email: string, method: string) {
  secureStore.set(REMEMBERED_KEY, JSON.stringify({ email, method }));
}

function remembered() {
  const raw = secureStore.get(REMEMBERED_KEY);
  return raw ? JSON.parse(raw) : null;
}

function renderSignIn(props: { addingAccount?: boolean; onNativeFallback?: () => void } = {}) {
  return render(
    <MobileSignIn
      addingAccount={props.addingAccount}
      onNativeFallback={props.onNativeFallback ?? jest.fn()}
      onSignUp={jest.fn()}
    />,
  );
}

describe('sign-in remembers the account for next time', () => {
  let platform: jest.ReplaceProperty<'OS', typeof Platform.OS>;

  beforeEach(() => {
    secureStore.clear();
    mockInstallStore.clear();
    mockInstallStore.set(INSTALL_MARKER_KEY, '1');
    jest.clearAllMocks();
    mockClerkEmail = undefined;
    mockAppleAvailable = false;
    mockAttempt = makeAttempt([{ strategy: 'password' }]);
    platform = jest.replaceProperty(Platform, 'OS', 'android');
  });

  afterEach(() => {
    platform.restore();
  });

  it('keeps the email and the email method after a password sign-in, and nothing else', async () => {
    renderSignIn();

    fireEvent.changeText(screen.getByTestId('mobile-sign-in-email'), 'a@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-in-continue'));
    await waitFor(() => expect(screen.getByTestId('mobile-sign-in-password')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('mobile-sign-in-password'), 'secret-password');
    fireEvent.press(screen.getByTestId('mobile-sign-in-submit-password'));

    await waitFor(() => expect(remembered()).toEqual({ email: 'a@example.com', method: 'email' }));
    expect(secureStore.get(REMEMBERED_KEY)).not.toContain('secret-password');
  });

  it('keeps the Google account under the email Clerk reports for the new session', async () => {
    mockClerkEmail = 'g@example.com';
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: 'sess_1',
      authSessionResult: { type: 'success' },
    });
    renderSignIn();

    fireEvent.press(screen.getByTestId('mobile-sign-in-google'));

    await waitFor(() => expect(remembered()).toEqual({ email: 'g@example.com', method: 'google' }));
  });

  it('keeps nothing when the browser is cancelled', async () => {
    mockClerkEmail = 'g@example.com';
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      authSessionResult: { type: 'cancel' },
    });
    renderSignIn();

    fireEvent.press(screen.getByTestId('mobile-sign-in-google'));
    await waitFor(() => expect(mockStartSSOFlow).toHaveBeenCalled());
    await act(async () => {});

    expect(remembered()).toBeNull();
  });

  it('keeps nothing when the finished sign-in has no email to show', async () => {
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: 'sess_1',
      authSessionResult: { type: 'success' },
    });
    renderSignIn();

    fireEvent.press(screen.getByTestId('mobile-sign-in-google'));
    await waitFor(() => expect(mockStartSSOFlow).toHaveBeenCalled());
    await act(async () => {});

    expect(remembered()).toBeNull();
  });
});

describe('Continue as a remembered account', () => {
  let platform: jest.ReplaceProperty<'OS', typeof Platform.OS>;

  beforeEach(() => {
    secureStore.clear();
    mockInstallStore.clear();
    mockInstallStore.set(INSTALL_MARKER_KEY, '1');
    jest.clearAllMocks();
    mockClerkEmail = undefined;
    mockAppleAvailable = false;
    mockAttempt = makeAttempt([{ strategy: 'password' }]);
    platform = jest.replaceProperty(Platform, 'OS', 'android');
  });

  afterEach(() => {
    platform.restore();
  });

  it('is hidden when no account is remembered', async () => {
    renderSignIn();
    await act(async () => {});

    expect(screen.queryByTestId('mobile-sign-in-continue-as')).toBeNull();
    expect(screen.queryByTestId('mobile-sign-in-not-you')).toBeNull();
  });

  it('names the remembered account and starts its provider', async () => {
    seedRemembered('g@example.com', 'google');
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      authSessionResult: { type: 'cancel' },
    });
    renderSignIn();

    const button = await screen.findByTestId('mobile-sign-in-continue-as');
    expect(screen.getByText('Continue as g@example.com')).toBeTruthy();
    fireEvent.press(button);

    await waitFor(() =>
      expect(mockStartSSOFlow).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: 'oauth_google' }),
      ),
    );
  });

  it('starts the email step with the remembered email', async () => {
    seedRemembered('a@example.com', 'email');
    renderSignIn();

    fireEvent.press(await screen.findByTestId('mobile-sign-in-continue-as'));

    await waitFor(() => expect(screen.getByTestId('mobile-sign-in-password')).toBeTruthy());
    expect(mockAttempt.create).toHaveBeenCalledWith({ identifier: 'a@example.com' });
    expect(screen.getByText('a@example.com')).toBeTruthy();
  });

  it('forgets the account when the person says it is not them', async () => {
    seedRemembered('a@example.com', 'email');
    renderSignIn();

    fireEvent.press(await screen.findByTestId('mobile-sign-in-not-you'));

    await waitFor(() => expect(screen.queryByTestId('mobile-sign-in-continue-as')).toBeNull());
    expect(screen.queryByTestId('mobile-sign-in-not-you')).toBeNull();
    expect(remembered()).toBeNull();
  });

  it('empties the email field that Continue as filled in when the person says it is not them', async () => {
    seedRemembered('a@example.com', 'email');
    mockAttempt.create.mockResolvedValue({ error: { code: 'form_identifier_not_found' } });
    renderSignIn();

    fireEvent.press(await screen.findByTestId('mobile-sign-in-continue-as'));
    await waitFor(() => expect(mockAttempt.create).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('mobile-sign-in-email').props.value).toBe('a@example.com'),
    );

    fireEvent.press(screen.getByTestId('mobile-sign-in-not-you'));

    await waitFor(() => expect(screen.getByTestId('mobile-sign-in-email').props.value).toBe(''));
    expect(remembered()).toBeNull();
  });

  it('keeps an email the person typed themselves when they forget a different account', async () => {
    seedRemembered('a@example.com', 'email');
    renderSignIn();

    const field = screen.getByTestId('mobile-sign-in-email');
    fireEvent.changeText(field, 'other@example.com');
    fireEvent.press(await screen.findByTestId('mobile-sign-in-not-you'));

    await waitFor(() => expect(remembered()).toBeNull());
    expect(screen.getByTestId('mobile-sign-in-email').props.value).toBe('other@example.com');
  });

  it('does not show an account left in the keychain by an earlier install of the app', async () => {
    mockInstallStore.clear();
    seedRemembered('previous-owner@example.com', 'email');
    renderSignIn();
    await act(async () => {});

    expect(screen.queryByTestId('mobile-sign-in-continue-as')).toBeNull();
    expect(screen.queryByText(/previous-owner@example.com/)).toBeNull();
    expect(remembered()).toBeNull();
    expect(mockInstallStore.get(INSTALL_MARKER_KEY)).toBeDefined();
  });

  it('keeps showing the account this install remembered after the first launch', async () => {
    mockInstallStore.clear();
    const firstLaunch = renderSignIn();
    await act(async () => {});
    firstLaunch.unmount();

    seedRemembered('a@example.com', 'email');
    const nextLaunch = renderSignIn();

    expect(await nextLaunch.findByText('Continue as a@example.com')).toBeTruthy();
  });

  it('is hidden while another account is being added', async () => {
    seedRemembered('a@example.com', 'email');
    renderSignIn({ addingAccount: true });
    await act(async () => {});

    expect(screen.queryByTestId('mobile-sign-in-continue-as')).toBeNull();
  });

  it('is hidden when its provider is not offered on this device', async () => {
    seedRemembered('a@example.com', 'apple');
    renderSignIn();
    await act(async () => {});

    expect(screen.queryByTestId('mobile-sign-in-continue-as')).toBeNull();
  });
});

describe('Continue as and Sign in with Apple on iOS', () => {
  let platform: jest.ReplaceProperty<'OS', typeof Platform.OS>;

  beforeEach(() => {
    secureStore.clear();
    mockInstallStore.clear();
    mockInstallStore.set(INSTALL_MARKER_KEY, '1');
    jest.clearAllMocks();
    mockClerkEmail = undefined;
    mockAppleAvailable = false;
    mockAttempt = makeAttempt([{ strategy: 'password' }]);
    platform = jest.replaceProperty(Platform, 'OS', 'ios');
  });

  afterEach(() => {
    platform.restore();
  });

  it('hides a remembered Google account when Sign in with Apple is not offered', async () => {
    seedRemembered('g@example.com', 'google');
    renderSignIn();
    await act(async () => {});

    expect(screen.queryByTestId('mobile-sign-in-continue-as')).toBeNull();
    expect(screen.queryByTestId('mobile-sign-in-google')).toBeNull();
  });

  it('still offers a remembered email account when Sign in with Apple is not offered', async () => {
    seedRemembered('a@example.com', 'email');
    renderSignIn();

    expect(await screen.findByTestId('mobile-sign-in-continue-as')).toBeTruthy();
  });

  it('shows a remembered Google account when Sign in with Apple is offered', async () => {
    mockAppleAvailable = true;
    seedRemembered('g@example.com', 'google');
    renderSignIn();

    expect(await screen.findByText('Continue as g@example.com')).toBeTruthy();
  });

  it('keeps the Apple account after a finished Apple sign-in', async () => {
    mockAppleAvailable = true;
    mockClerkEmail = 'p@example.com';
    const setActive = jest.fn().mockResolvedValue(undefined);
    mockStartApple.mockResolvedValue({ createdSessionId: 'sess_apple', setActive });
    renderSignIn();

    fireEvent.press(await screen.findByTestId('mock-apple-button'));

    await waitFor(() => expect(remembered()).toEqual({ email: 'p@example.com', method: 'apple' }));
    expect(setActive).toHaveBeenCalledWith(expect.objectContaining({ session: 'sess_apple' }));
  });

  it('starts the Apple flow from Continue as for a remembered Apple account', async () => {
    mockAppleAvailable = true;
    seedRemembered('p@example.com', 'apple');
    mockStartApple.mockResolvedValue({ createdSessionId: null });
    renderSignIn();

    fireEvent.press(await screen.findByTestId('mobile-sign-in-continue-as'));

    await waitFor(() => expect(mockStartApple).toHaveBeenCalled());
  });
});

describe('an email that Clerk routes to enterprise sign-in', () => {
  let platform: jest.ReplaceProperty<'OS', typeof Platform.OS>;

  beforeEach(() => {
    secureStore.clear();
    mockInstallStore.clear();
    mockInstallStore.set(INSTALL_MARKER_KEY, '1');
    jest.clearAllMocks();
    mockClerkEmail = undefined;
    mockAppleAvailable = false;
    mockAttempt = makeAttempt([{ strategy: 'enterprise_sso' }, { strategy: 'password' }]);
    platform = jest.replaceProperty(Platform, 'OS', 'android');
  });

  afterEach(() => {
    platform.restore();
  });

  it('starts the enterprise flow for that email instead of the password step', async () => {
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: 'sess_1',
      authSessionResult: { type: 'success' },
    });
    renderSignIn();

    fireEvent.changeText(screen.getByTestId('mobile-sign-in-email'), 'a@corp.example');
    fireEvent.press(screen.getByTestId('mobile-sign-in-continue'));

    await waitFor(() =>
      expect(mockStartSSOFlow).toHaveBeenCalledWith({
        strategy: 'enterprise_sso',
        identifier: 'a@corp.example',
        redirectUrl: 'agiworkforce://login',
      }),
    );
    expect(screen.queryByTestId('mobile-sign-in-password')).toBeNull();
    await waitFor(() => expect(remembered()).toEqual({ email: 'a@corp.example', method: 'email' }));
  });

  it('returns to the email step without an error when the browser is cancelled', async () => {
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      authSessionResult: { type: 'dismiss' },
    });
    const onNativeFallback = jest.fn();
    renderSignIn({ onNativeFallback });

    fireEvent.changeText(screen.getByTestId('mobile-sign-in-email'), 'a@corp.example');
    fireEvent.press(screen.getByTestId('mobile-sign-in-continue'));

    await waitFor(() => expect(mockStartSSOFlow).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByTestId('mobile-sign-in-email')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onNativeFallback).not.toHaveBeenCalled();
    expect(remembered()).toBeNull();
  });
});
