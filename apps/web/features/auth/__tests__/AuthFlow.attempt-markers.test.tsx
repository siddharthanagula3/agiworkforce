import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ACCOUNT_AGE_CONFIRMATION_LABEL } from '@agiworkforce/types';

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
}));

vi.mock('../identityAuthAdapter', async (importOriginal) => ({
  ...(await importOriginal()),
  useIdentityAuthClient: () => client,
  IdentityBotProtection: () => null,
}));

import {
  MARKETING_EMAIL_ATTEMPT_STORAGE_KEY,
  MARKETING_EMAIL_CHOICE_STORAGE_KEY,
  TERMS_GATE_STORAGE_KEY,
  writeSignupAttemptMarkers,
} from '@/app/signup/signupAttemptMarkers';
import { MARKETING_EMAIL_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { AuthFlow } from '../AuthFlow';
import type { AuthMode, AuthProvider, AuthResult, AuthStep } from '../authContract';

const PROVIDERS: readonly AuthProvider[] = [{ id: 'google', label: 'Google' }];
const EMAIL = 'person@example.com';
const REDIRECTS = {
  completeUrl: '/signup/complete',
  switchUrl: '/login',
  ssoCallbackUrl: '/auth/sso-callback',
};
const REQUIRED_BOX = new RegExp(`^${ACCOUNT_AGE_CONFIRMATION_LABEL}, agree to the Terms of Use`);
const NOTHING_CARRIED = { terms: null, choice: null, attempt: null, attemptInThisTab: null };

function markers() {
  return {
    terms: window.localStorage.getItem(TERMS_GATE_STORAGE_KEY),
    choice: window.localStorage.getItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY),
    attempt: window.localStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY),
    attemptInThisTab: window.sessionStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY),
  };
}

function renderFlow(mode: AuthMode, passkeySignIn = false) {
  render(
    <AuthFlow
      mode={mode}
      providers={PROVIDERS}
      redirects={REDIRECTS}
      passkeySignIn={passkeySignIn}
    />,
  );
}

async function admitTickedSignupThatReaches(step: AuthStep) {
  client.startWithEmail.mockResolvedValue({ status: 'next', step } satisfies AuthResult);
  renderFlow('signup');
  await userEvent.click(screen.getByRole('checkbox', { name: REQUIRED_BOX }));
  await userEvent.click(
    screen.getByRole('checkbox', { name: MARKETING_EMAIL_CONSENT_PURPOSE.label }),
  );
  await userEvent.type(screen.getByLabelText('Email address'), EMAIL);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(markers().choice).toBe(POLICY_LAST_UPDATED.privacy));
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

describe('a sign-up attempt admitted with the marketing email box ticked', () => {
  it('keeps the terms marker, the choice and one attempt id held by this tab', async () => {
    await admitTickedSignupThatReaches({
      kind: 'code',
      email: EMAIL,
      purpose: 'sign_up',
      methods: [],
    });

    const carried = markers();
    expect(carried.terms).toBe(POLICY_LAST_UPDATED.terms);
    expect(carried.choice).toBe(POLICY_LAST_UPDATED.privacy);
    expect(carried.attempt).toBeTruthy();
    expect(carried.attemptInThisTab).toBe(carried.attempt);
  });
});

describe('Edit email', () => {
  it.each<[string, AuthStep]>([
    ['the code step', { kind: 'code', email: EMAIL, purpose: 'sign_up', methods: [] }],
    ['the new password step', { kind: 'new_password', email: EMAIL, purpose: 'sign_up' }],
  ])('drops every marker of the attempt when pressed on %s of a sign-up', async (_step, step) => {
    await admitTickedSignupThatReaches(step);

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    expect(markers()).toEqual(NOTHING_CARRIED);
    expect(client.restart).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox', { name: REQUIRED_BOX })).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: MARKETING_EMAIL_CONSENT_PURPOSE.label }),
    ).not.toBeChecked();
  });

  it('carries only what the next attempt chose after the email was edited', async () => {
    await admitTickedSignupThatReaches({
      kind: 'code',
      email: EMAIL,
      purpose: 'sign_up',
      methods: [],
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    await userEvent.click(screen.getByRole('checkbox', { name: REQUIRED_BOX }));
    await userEvent.type(screen.getByLabelText('Email address'), 'second@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(markers().terms).toBe(POLICY_LAST_UPDATED.terms));
    expect(markers()).toEqual({ ...NOTHING_CARRIED, terms: POLICY_LAST_UPDATED.terms });
  });

  it('drops markers written since the sign-in started when pressed during a sign-in', async () => {
    client.startWithEmail.mockImplementation(async () => {
      writeSignupAttemptMarkers({ marketingEmail: true });
      return { status: 'next', step: { kind: 'password', email: EMAIL, methods: ['password'] } };
    });
    renderFlow('login');
    await userEvent.type(screen.getByLabelText('Email address'), EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('button', { name: 'Edit' });
    expect(markers().choice).toBe(POLICY_LAST_UPDATED.privacy);

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(markers()).toEqual(NOTHING_CARRIED);
  });
});

describe('a passkey sign-in', () => {
  it('drops every marker an abandoned sign-up left before the passkey is asked for', async () => {
    writeSignupAttemptMarkers({ marketingEmail: true });
    const carriedWhenAsked: ReturnType<typeof markers>[] = [];
    client.signInWithPasskey.mockImplementation(async () => {
      carriedWhenAsked.push(markers());
      return { status: 'complete' };
    });
    renderFlow('login', true);

    await userEvent.click(
      await screen.findByRole('button', { name: /Sign in with a passkey or security key/ }),
    );

    await waitFor(() => expect(client.signInWithPasskey).toHaveBeenCalledTimes(1));
    expect(carriedWhenAsked).toEqual([NOTHING_CARRIED]);
    expect(markers()).toEqual(NOTHING_CARRIED);
  });
});
