import React from 'react';
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

function makeAttempt(factors: Factor[]): MockAttempt {
  return {
    status: 'needs_first_factor',
    supportedFirstFactors: factors,
    create: jest.fn(),
    password: jest.fn().mockResolvedValue({ error: null }),
    reset: jest.fn().mockResolvedValue({ error: null }),
    finalize: jest.fn().mockResolvedValue({ error: null }),
    emailCode: {
      sendCode: jest.fn().mockResolvedValue({ error: null }),
      verifyCode: jest.fn().mockResolvedValue({ error: null }),
    },
  };
}

jest.mock('@clerk/expo', () => ({
  useSignIn: () => ({ signIn: mockAttempt, fetchStatus: 'idle' }),
}));
jest.mock('@clerk/expo/apple', () => ({
  useSignInWithApple: () => ({ startAppleAuthenticationFlow: jest.fn() }),
}));
jest.mock('@clerk/expo/experimental', () => ({
  useSSO: () => ({ startSSOFlow: jest.fn() }),
}));
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  AppleAuthenticationButton: () => null,
  AppleAuthenticationButtonType: { CONTINUE: 0 },
  AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 1 },
}));
jest.mock('expo-linking', () => ({ createURL: jest.fn(() => 'agiworkforce://login') }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock('@/lib/safeOpenURL', () => ({ openUntrustedUrlInAppBrowser: jest.fn() }));

import { MobileSignIn } from '../src/features/auth/components/MobileSignIn';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

function renderSignIn() {
  return render(<MobileSignIn onNativeFallback={jest.fn()} onSignUp={jest.fn()} />);
}

describe('sign-in names the account the admitted attempt belongs to', () => {
  it('keeps the password step on the account whose attempt was created', async () => {
    mockAttempt = makeAttempt([{ strategy: 'password' }]);
    const pending = deferred<{ error: null }>();
    mockAttempt.create.mockReturnValue(pending.promise);
    renderSignIn();

    fireEvent.changeText(screen.getByTestId('mobile-sign-in-email'), 'a@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-in-continue'));
    fireEvent.changeText(screen.getByTestId('mobile-sign-in-email'), 'b@example.com');
    await act(async () => {
      pending.resolve({ error: null });
      await pending.promise;
    });

    await waitFor(() => expect(screen.getByTestId('mobile-sign-in-password')).toBeTruthy());
    expect(mockAttempt.create).toHaveBeenCalledWith({ identifier: 'a@example.com' });
    expect(screen.getByText('a@example.com')).toBeTruthy();
    expect(screen.queryByText('b@example.com')).toBeNull();
  });

  it('keeps the code instructions on the account whose attempt was created', async () => {
    mockAttempt = makeAttempt([{ strategy: 'email_code' }]);
    const pending = deferred<{ error: null }>();
    mockAttempt.create.mockReturnValue(pending.promise);
    renderSignIn();

    fireEvent.changeText(screen.getByTestId('mobile-sign-in-email'), 'a@example.com');
    fireEvent.press(screen.getByTestId('mobile-sign-in-continue'));
    fireEvent.changeText(screen.getByTestId('mobile-sign-in-email'), 'b@example.com');
    await act(async () => {
      pending.resolve({ error: null });
      await pending.promise;
    });

    await waitFor(() => expect(screen.getByTestId('mobile-sign-in-code')).toBeTruthy());
    expect(screen.getByText('Enter the code sent to a@example.com.')).toBeTruthy();
    expect(screen.queryByText(/b@example\.com/)).toBeNull();
  });
});
