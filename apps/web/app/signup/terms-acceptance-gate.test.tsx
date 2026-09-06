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

vi.mock('@clerk/nextjs', () => ({
  AuthenticateWithRedirectCallback: () => null,
  useClerk: () => ({ loaded: true }),
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
});
