import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  AGE_CHECK_STORAGE_KEY,
  MARKETING_EMAIL_ATTEMPT_STORAGE_KEY,
  MARKETING_EMAIL_CHOICE_STORAGE_KEY,
} from './signupAttemptMarkers';
import { TERMS_GATE_STORAGE_KEY } from './TermsGate';

const signUpState = vi.hoisted(() => ({
  status: 'missing_requirements',
  emailAddress: 'person@example.com',
  missingFields: [] as string[],
  unverifiedFields: ['email_address'],
  create: vi.fn(),
  verifications: {
    emailAddress: { status: null },
    sendEmailCode: vi.fn(),
    verifyEmailCode: vi.fn(),
  },
  sso: vi.fn(),
  finalize: vi.fn(),
  reset: vi.fn(),
}));

const signInState = vi.hoisted(() => ({
  status: 'needs_identifier',
  identifier: null,
  supportedFirstFactors: [] as { strategy: string }[],
  supportedSecondFactors: [],
  create: vi.fn(),
  password: vi.fn(),
  emailCode: { sendCode: vi.fn(), verifyCode: vi.fn() },
  resetPasswordEmailCode: { sendCode: vi.fn(), verifyCode: vi.fn(), submitPassword: vi.fn() },
  mfa: {
    sendPhoneCode: vi.fn(),
    verifyTOTP: vi.fn(),
    verifyPhoneCode: vi.fn(),
    verifyBackupCode: vi.fn(),
  },
  sso: vi.fn(),
  passkey: vi.fn(),
  finalize: vi.fn(),
  reset: vi.fn(),
}));

const clerkState = vi.hoisted(() => ({
  loaded: true,
  on: vi.fn((_event: string, listener: () => void, options?: { notify?: boolean }) => {
    if (options?.notify) listener();
  }),
  off: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  AuthenticateWithRedirectCallback: () => null,
  useClerk: () => clerkState,
  useSignIn: () => ({ signIn: signInState, errors: null, fetchStatus: 'idle' }),
  useSignUp: () => ({ signUp: signUpState, errors: null, fetchStatus: 'idle' }),
}));

import { AuthFlow } from '@/features/auth/AuthFlow';

const REDIRECTS = {
  signInCompleteUrl: '/login/complete?redirectTo=%2Fchat',
  signUpCompleteUrl: '/signup/complete?redirectTo=%2Fchat',
  ssoCallbackUrl: '/auth/sso-callback?redirectTo=%2Fchat',
};

const PROVIDERS = [{ id: 'google' as const, label: 'Google' }];
const EMAIL = 'person@example.com';
const UNREACHABLE = 'We could not reach the server. Check your connection and try again.';
const NO_ACCOUNT = {
  error: { errors: [{ code: 'form_identifier_not_found', meta: { paramName: 'identifier' } }] },
};

function renderEntry() {
  render(<AuthFlow providers={PROVIDERS} redirects={REDIRECTS} />);
}

async function continueWith(email = EMAIL) {
  await userEvent.type(screen.getByLabelText('Email address'), email);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

function termsMarker(): string | null {
  return window.localStorage.getItem(TERMS_GATE_STORAGE_KEY);
}

function leaveEarlierAttemptKeys(): void {
  window.localStorage.setItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY, POLICY_LAST_UPDATED.privacy);
  window.localStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, 'earlier-attempt');
  window.sessionStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, 'earlier-attempt');
  window.localStorage.setItem(AGE_CHECK_STORAGE_KEY, '18');
}

function nothingLeftFromEarlierAttempts(): void {
  expect(window.localStorage.getItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY)).toBeNull();
  expect(window.localStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBeNull();
  expect(window.sessionStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBeNull();
  expect(window.localStorage.getItem(AGE_CHECK_STORAGE_KEY)).toBeNull();
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  signInState.supportedFirstFactors = [];
  signInState.create.mockReset().mockResolvedValue({ error: null });
  signInState.emailCode.sendCode.mockReset().mockResolvedValue({ error: null });
  signInState.sso.mockReset().mockResolvedValue({ error: null });
  signInState.reset.mockReset().mockResolvedValue({ error: null });
  signUpState.create.mockReset().mockResolvedValue({ error: null });
  signUpState.verifications.sendEmailCode.mockReset().mockResolvedValue({ error: null });
  signUpState.sso.mockReset().mockResolvedValue({ error: null });
  signUpState.reset.mockReset().mockResolvedValue({ error: null });
});

/**
 * Owner decision 2026-11-20: one screen logs in and signs up. The agreement is
 * one line under Continue, shown before anything can create an account; the
 * age is asked after the account exists, on /signup/complete.
 */
describe('the agreement on the one screen', () => {
  it('is stated once, under the action, before any way in can create an account', () => {
    renderEntry();

    const agreement = screen.getByTestId('auth-signup-agreement');
    expect(agreement).toHaveTextContent(
      'By continuing, you agree to our Terms and Privacy Policy.',
    );
    expect(within(agreement).queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getAllByText(/By continuing/)).toHaveLength(1);
  });

  it('creates an account for an address no account uses, with the agreement recorded', async () => {
    signInState.create.mockResolvedValue(NO_ACCOUNT);
    leaveEarlierAttemptKeys();
    renderEntry();

    await continueWith();

    await waitFor(() =>
      expect(signUpState.create).toHaveBeenCalledWith({ emailAddress: EMAIL, legalAccepted: true }),
    );
    await waitFor(() => expect(termsMarker()).toBe(POLICY_LAST_UPDATED.terms));
    nothingLeftFromEarlierAttempts();
  });

  it('writes no marker for an address an account uses, and drops one an earlier attempt left', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'email_code' }];
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
    renderEntry();

    await continueWith();

    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(signUpState.create).not.toHaveBeenCalled();
    expect(termsMarker()).toBeNull();
  });

  it('hands every provider over as a sign-in and writes the marker, since the line was on screen', async () => {
    leaveEarlierAttemptKeys();
    renderEntry();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() =>
      expect(signInState.sso).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: 'oauth_google' }),
      ),
    );
    expect(signUpState.sso).not.toHaveBeenCalled();
    expect(termsMarker()).toBe(POLICY_LAST_UPDATED.terms);
    nothingLeftFromEarlierAttempts();
  });

  it('does not leave a marker behind after the sign-up is refused', async () => {
    signInState.create.mockResolvedValue(NO_ACCOUNT);
    signUpState.create.mockResolvedValue({
      error: { errors: [{ code: 'form_identifier_exists' }] },
    });
    renderEntry();

    await continueWith();

    await waitFor(() => expect(signUpState.create).toHaveBeenCalled());
    expect(termsMarker()).toBeNull();
  });

  it('recovers from a rejected sign-up request without claiming the agreement was recorded', async () => {
    signInState.create.mockResolvedValue(NO_ACCOUNT);
    signUpState.create.mockRejectedValue(new TypeError('Failed to fetch'));
    renderEntry();

    await continueWith();

    expect(await screen.findByText(UNREACHABLE)).toBeInTheDocument();
    expect(termsMarker()).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();

    signUpState.create.mockResolvedValue({ error: null });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(signUpState.create).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(termsMarker()).toBe(POLICY_LAST_UPDATED.terms));
  });

  it('clears the marker when a provider handoff is refused', async () => {
    signInState.sso.mockResolvedValue({
      error: { errors: [{ code: 'oauth_access_denied' }] },
    });
    renderEntry();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(signInState.sso).toHaveBeenCalled());
    await waitFor(() => expect(termsMarker()).toBeNull());
  });

  it('clears the marker and offers a retry when the provider handoff throws', async () => {
    signInState.sso.mockRejectedValue(new TypeError('Failed to fetch'));
    renderEntry();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(termsMarker()).toBeNull());
    expect(screen.getByText(UNREACHABLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });

  it('drops the marker when the address is edited, so the next attempt starts clean', async () => {
    signInState.create.mockResolvedValue(NO_ACCOUNT);
    renderEntry();
    await continueWith();
    await waitFor(() => expect(termsMarker()).toBe(POLICY_LAST_UPDATED.terms));

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    expect(await screen.findByLabelText('Email address')).toBeInTheDocument();
    expect(termsMarker()).toBeNull();
  });
});
