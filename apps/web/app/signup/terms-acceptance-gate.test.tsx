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
 * Founder decision 2026-08-17: no consent wall above the form. The clickwrap is
 * one line against the button being pressed, which is where the deliberate act
 * happens, and no account can be created until it is ticked. The durable record
 * is still written server-side by /signup/complete, which is what makes "what
 * did they agree to, and when" answerable at all.
 */
describe('/signup terms clickwrap', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signUpState.create.mockReset().mockResolvedValue({ error: null });
    signUpState.verifications.sendEmailCode.mockReset().mockResolvedValue({ error: null });
    signUpState.sso.mockReset().mockResolvedValue({ error: null });
  });

  it('will not create an account until the terms are accepted', async () => {
    renderSignup();

    await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Accept the terms to create an account'),
    );
    expect(signUpState.create).not.toHaveBeenCalled();
  });

  it('will not hand an unaccepted sign-up to a provider either', async () => {
    renderSignup();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Accept the terms to create an account'),
    );
    expect(signUpState.sso).not.toHaveBeenCalled();
  });

  it('creates the account with the accepted terms recorded once the box is ticked', async () => {
    renderSignup();

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(signUpState.create).toHaveBeenCalledWith({
        emailAddress: 'person@example.com',
        legalAccepted: true,
      }),
    );
  });

  it('marks acceptance against the policy version so the provider round trip keeps it', async () => {
    renderSignup();

    await userEvent.click(screen.getByRole('checkbox'));

    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
  });

  it('restores an acceptance recorded before a provider round trip', async () => {
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
    renderSignup();

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
  });

  it('re-asks when the recorded acceptance is for an older policy version', async () => {
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, '1970-01-01');
    renderSignup();

    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('clears the marker when the box is un-ticked', async () => {
    renderSignup();

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('checkbox'));

    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
  });
});
