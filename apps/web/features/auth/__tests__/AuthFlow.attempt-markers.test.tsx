import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signUpStarted = vi.hoisted(() => ({ report: undefined as (() => void) | undefined }));

const client = vi.hoisted(() => ({
  isReady: true,
  startWithEmail: vi.fn(),
  submitPassword: vi.fn(),
  submitCode: vi.fn(),
  resendCode: vi.fn(),
  submitSecondFactor: vi.fn(),
  switchSecondFactor: vi.fn(),
  submitNewPassword: vi.fn(),
  startPasswordReset: vi.fn(),
  startMethod: vi.fn(),
  startProvider: vi.fn(),
  signInWithPasskey: vi.fn(),
  restart: vi.fn(),
  readProviderReturn: () => null,
}));

vi.mock('../IdentityAuthAdapter', async (importOriginal) => ({
  ...(await importOriginal()),
  useIdentityAuthClient: (_redirects: unknown, options: { onSignUpStarted?: () => void }) => {
    signUpStarted.report = options.onSignUpStarted;
    return client;
  },
  IdentityBotProtection: () => null,
}));

import {
  AGE_CHECK_STORAGE_KEY,
  MARKETING_EMAIL_ATTEMPT_STORAGE_KEY,
  MARKETING_EMAIL_CHOICE_STORAGE_KEY,
  TERMS_GATE_STORAGE_KEY,
  writeSignupAttemptMarkers,
} from '@/app/signup/signupAttemptMarkers';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { AuthFlow } from '../AuthFlow';
import type { AuthProvider, AuthResult, AuthStep } from '../authContract';

const PROVIDERS: readonly AuthProvider[] = [{ id: 'google', label: 'Google' }];
const EMAIL = 'person@example.com';
const REDIRECTS = {
  signInCompleteUrl: '/login/complete',
  signUpCompleteUrl: '/signup/complete',
  ssoCallbackUrl: '/auth/sso-callback',
};
const NOTHING_CARRIED = {
  terms: null,
  ageCheckedAgainst: null,
  choice: null,
  attempt: null,
  attemptInThisTab: null,
};

function markers() {
  return {
    terms: window.localStorage.getItem(TERMS_GATE_STORAGE_KEY),
    ageCheckedAgainst: window.localStorage.getItem(AGE_CHECK_STORAGE_KEY),
    choice: window.localStorage.getItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY),
    attempt: window.localStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY),
    attemptInThisTab: window.sessionStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY),
  };
}

function leaveEarlierAttemptKeys(): void {
  window.localStorage.setItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY, POLICY_LAST_UPDATED.privacy);
  window.localStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, 'earlier-attempt');
  window.sessionStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, 'earlier-attempt');
  window.localStorage.setItem(AGE_CHECK_STORAGE_KEY, '18');
}

function renderFlow(passkeySignIn = false) {
  render(<AuthFlow providers={PROVIDERS} redirects={REDIRECTS} passkeySignIn={passkeySignIn} />);
}

async function continueToStep(step: AuthStep) {
  client.startWithEmail.mockImplementation(async () => {
    if (step.kind !== 'password' && 'purpose' in step && step.purpose === 'sign_up') {
      signUpStarted.report?.();
    }
    return { status: 'next', step } satisfies AuthResult;
  });
  renderFlow();
  await userEvent.type(screen.getByLabelText('Email address'), EMAIL);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

beforeEach(() => {
  client.isReady = true;
  for (const fn of Object.values(client)) {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      fn.mockReset();
      fn.mockResolvedValue({ status: 'complete' } as AuthResult);
    }
  }
  Object.defineProperty(window, 'PublicKeyCredential', {
    configurable: true,
    value: function PublicKeyCredential() {},
  });
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('the marker an email attempt carries', () => {
  it.each<[string, AuthStep]>([
    ['the code step', { kind: 'code', email: EMAIL, purpose: 'sign_up', methods: [] }],
    ['the new password step', { kind: 'new_password', email: EMAIL, purpose: 'sign_up' }],
  ])('is the terms marker alone once a sign-up reaches %s', async (_step, step) => {
    leaveEarlierAttemptKeys();
    await continueToStep(step);

    await waitFor(() => expect(markers().terms).toBe(POLICY_LAST_UPDATED.terms));
    expect(markers()).toEqual({ ...NOTHING_CARRIED, terms: POLICY_LAST_UPDATED.terms });
  });

  it.each<[string, AuthStep]>([
    ['the password step', { kind: 'password', email: EMAIL, methods: ['password'] }],
    ['a sign-in code', { kind: 'code', email: EMAIL, purpose: 'sign_in', methods: [] }],
  ])('is nothing at all when the address reaches %s of a sign-in', async (_step, step) => {
    writeSignupAttemptMarkers();
    leaveEarlierAttemptKeys();
    await continueToStep(step);

    await screen.findByRole('button', { name: 'Edit' });
    expect(markers()).toEqual(NOTHING_CARRIED);
  });
});

describe('Edit email', () => {
  it.each<[string, AuthStep]>([
    ['the code step', { kind: 'code', email: EMAIL, purpose: 'sign_up', methods: [] }],
    ['the new password step', { kind: 'new_password', email: EMAIL, purpose: 'sign_up' }],
  ])('drops the marker of the attempt when pressed on %s of a sign-up', async (_step, step) => {
    await continueToStep(step);
    await waitFor(() => expect(markers().terms).toBe(POLICY_LAST_UPDATED.terms));

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    expect(markers()).toEqual(NOTHING_CARRIED);
    expect(client.restart).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Email address')).toHaveValue('');
  });

  it('drops markers written since the sign-in started when pressed during a sign-in', async () => {
    client.startWithEmail.mockImplementation(async () => {
      writeSignupAttemptMarkers();
      return { status: 'next', step: { kind: 'password', email: EMAIL, methods: ['password'] } };
    });
    renderFlow();
    await userEvent.type(screen.getByLabelText('Email address'), EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('button', { name: 'Edit' });
    expect(markers().terms).toBe(POLICY_LAST_UPDATED.terms);

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(markers()).toEqual(NOTHING_CARRIED);
  });
});

describe('a passkey sign-in', () => {
  it('drops every marker an abandoned sign-up left before the passkey is asked for', async () => {
    writeSignupAttemptMarkers();
    leaveEarlierAttemptKeys();
    const carriedWhenAsked: ReturnType<typeof markers>[] = [];
    client.signInWithPasskey.mockImplementation(async () => {
      carriedWhenAsked.push(markers());
      return { status: 'complete' };
    });
    renderFlow(true);

    await userEvent.click(
      await screen.findByRole('button', { name: /Sign in with a passkey or security key/ }),
    );

    await waitFor(() => expect(client.signInWithPasskey).toHaveBeenCalledTimes(1));
    expect(carriedWhenAsked).toEqual([NOTHING_CARRIED]);
    expect(markers()).toEqual(NOTHING_CARRIED);
  });
});
