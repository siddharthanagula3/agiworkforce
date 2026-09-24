import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { TERMS_GATE_STORAGE_KEY } from './TermsGate';

const signUpState = vi.hoisted(() => ({
  status: 'missing_requirements',
  create: vi.fn(),
  verifications: { sendEmailCode: vi.fn(), verifyEmailCode: vi.fn() },
  sso: vi.fn(),
  finalize: vi.fn(),
  reset: vi.fn(),
}));

const signInState = vi.hoisted(() => ({
  status: 'needs_identifier',
  identifier: null,
  supportedFirstFactors: [],
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
  completeUrl: '/signup/complete?redirectTo=%2Fchat',
  switchUrl: '/login',
  ssoCallbackUrl: '/auth/sso-callback?redirectTo=%2Fchat',
};

const PROVIDERS = [{ id: 'google' as const, label: 'Google' }];

function renderSignup() {
  render(<AuthFlow mode="signup" providers={PROVIDERS} redirects={REDIRECTS} />);
}

/**
 * Founder decision 2026-09-06, replacing the 2026-08-17 clickwrap: signing up
 * is the agreement. The form says so in one sentence under the button, no box
 * to tick, and the durable record is still written server-side by
 * /signup/complete against the policy version.
 */
describe('/signup agreement', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signUpState.create.mockReset().mockResolvedValue({ error: null });
    signUpState.verifications.sendEmailCode.mockReset().mockResolvedValue({ error: null });
    signUpState.sso.mockReset().mockResolvedValue({ error: null });
  });

  it('shows the agreement sentence and no checkbox', () => {
    renderSignup();

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('auth-legal-footer')).toHaveTextContent('By signing up, you agree');
  });

  it('creates the account with the agreement recorded when the email is submitted', async () => {
    renderSignup();

    await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(signUpState.create).toHaveBeenCalledWith({
        emailAddress: 'person@example.com',
        legalAccepted: true,
      }),
    );
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
  });

  it('hands a provider sign-up over with the agreement recorded', async () => {
    renderSignup();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() =>
      expect(signUpState.sso).toHaveBeenCalledWith(
        expect.objectContaining({ legalAccepted: true }),
      ),
    );
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
  });

  it('does not leave an acceptance marker behind after signup initiation fails', async () => {
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
    signUpState.create.mockResolvedValue({
      error: { errors: [{ code: 'form_identifier_exists' }] },
    });
    renderSignup();

    await userEvent.type(screen.getByLabelText('Email address'), 'existing@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(signUpState.create).toHaveBeenCalled());
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
  });

  it('recovers from a rejected email signup request without claiming agreement was recorded', async () => {
    signUpState.create.mockRejectedValue(new TypeError('Failed to fetch'));
    renderSignup();

    await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText(
        'We could not reach the server. Check your connection and try again.',
      ),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('clears the signup marker when a provider handoff is refused', async () => {
    signUpState.sso.mockResolvedValue({
      error: { errors: [{ code: 'oauth_access_denied' }] },
    });
    renderSignup();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(signUpState.sso).toHaveBeenCalled());
    await waitFor(() => expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull());
  });

  it('clears the signup marker and offers a retry when the provider handoff throws', async () => {
    signUpState.sso.mockRejectedValue(new TypeError('Failed to fetch'));
    renderSignup();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull());
    expect(
      screen.getByText('We could not reach the server. Check your connection and try again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });
});
