import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor, within, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ACCOUNT_AGE_CONFIRMATION_LABEL } from '@agiworkforce/types';

const signUpState = vi.hoisted(() => ({
  status: 'missing_requirements' as string | null,
  createdUserId: null as string | null,
  createdSessionId: null as string | null,
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

const session = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: false, userId: null, sessionId: null } as Record<
    string,
    unknown
  >,
  replace: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  AuthenticateWithRedirectCallback: () => null,
  useClerk: () => clerkState,
  useAuth: () => session.auth,
  useSignIn: () => ({ signIn: signInState, errors: null, fetchStatus: 'idle' }),
  useSignUp: () => ({ signUp: signUpState, errors: null, fetchStatus: 'idle' }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: session.replace }),
}));
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

import { AuthFlow } from '@/features/auth/AuthFlow';
import { PRODUCT_UPDATES_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { RecordTermsAcceptance } from './complete/RecordTermsAcceptance';
import { PRODUCT_UPDATES_CHOICE_STORAGE_KEY, TERMS_GATE_STORAGE_KEY } from './signupAttemptMarkers';

const REDIRECTS = {
  completeUrl: '/signup/complete?redirectTo=%2Fchat',
  switchUrl: '/login',
  ssoCallbackUrl: '/auth/sso-callback?redirectTo=%2Fchat',
};
const PROVIDERS = [{ id: 'google' as const, label: 'Google' }];
const REQUIRED_BOX = new RegExp(`^${ACCOUNT_AGE_CONFIRMATION_LABEL}, agree to the Terms of Use`);
const TERMS_ONLY = { surface: 'web-signup', version: POLICY_LAST_UPDATED.terms };
const TERMS_AND_GRANT = { ...TERMS_ONLY, productUpdatesNoticeVersion: POLICY_LAST_UPDATED.privacy };

function openSignup(): RenderResult {
  return render(<AuthFlow mode="signup" providers={PROVIDERS} redirects={REDIRECTS} />);
}

async function admitByEmail(tab: RenderResult, { productUpdates }: { productUpdates: boolean }) {
  const screen = within(tab.container);
  await userEvent.click(screen.getByRole('checkbox', { name: REQUIRED_BOX }));
  if (productUpdates) {
    await userEvent.click(
      screen.getByRole('checkbox', { name: PRODUCT_UPDATES_CONSENT_PURPOSE.label }),
    );
  }
  await userEvent.type(screen.getByLabelText('Email address'), 'person@example.com');
  const admitted = signUpState.create.mock.calls.length;
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(signUpState.create.mock.calls.length).toBe(admitted + 1));
  await waitFor(() =>
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms),
  );
}

async function admitByProvider(tab: RenderResult, { productUpdates }: { productUpdates: boolean }) {
  const screen = within(tab.container);
  await userEvent.click(screen.getByRole('checkbox', { name: REQUIRED_BOX }));
  if (productUpdates) {
    await userEvent.click(
      screen.getByRole('checkbox', { name: PRODUCT_UPDATES_CONSENT_PURPOSE.label }),
    );
  }
  const admitted = signUpState.sso.mock.calls.length;
  await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
  await waitFor(() => expect(signUpState.sso.mock.calls.length).toBe(admitted + 1));
}

async function landOnSignupCompleteWithTheNewAccount(): Promise<Record<string, unknown>[]> {
  signUpState.status = 'complete';
  signUpState.createdUserId = 'new-user';
  signUpState.createdSessionId = 'new-session';
  session.auth = {
    isLoaded: true,
    isSignedIn: true,
    userId: 'new-user',
    sessionId: 'new-session',
  };
  render(<RecordTermsAcceptance redirectTo="/chat" />);
  await waitFor(() => expect(session.replace).toHaveBeenCalledWith('/chat'));
  return (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
    ([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>,
  );
}

describe('a sign-up attempt carried from the sign-up screen to the account', () => {
  beforeEach(() => {
    window.localStorage.clear();
    session.replace.mockReset();
    signUpState.status = 'missing_requirements';
    signUpState.createdUserId = null;
    signUpState.createdSessionId = null;
    signUpState.create.mockReset().mockResolvedValue({ error: null });
    signUpState.verifications.sendEmailCode.mockReset().mockResolvedValue({ error: null });
    signUpState.sso.mockReset().mockResolvedValue({ error: null });
    session.auth = { isLoaded: true, isSignedIn: false, userId: null, sessionId: null };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );
  });

  it.each([
    ['the email step', admitByEmail],
    ['a provider round trip', admitByProvider],
  ])(
    'sends a choice ticked before %s in the request that records the terms, then forgets it',
    async (_path, admit) => {
      const tab = openSignup();
      await admit(tab, { productUpdates: true });
      tab.unmount();

      expect(await landOnSignupCompleteWithTheNewAccount()).toEqual([TERMS_AND_GRANT]);
      expect(window.localStorage.getItem(PRODUCT_UPDATES_CHOICE_STORAGE_KEY)).toBeNull();
      expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
    },
  );

  it.each([
    ['the email step', admitByEmail],
    ['a provider round trip', admitByProvider],
  ])('sends the terms alone when the box was left empty before %s', async (_path, admit) => {
    const tab = openSignup();
    await admit(tab, { productUpdates: false });
    tab.unmount();

    expect(await landOnSignupCompleteWithTheNewAccount()).toEqual([TERMS_ONLY]);
  });

  it('sends nothing ticked by a person who then started again with the box empty', async () => {
    const first = openSignup();
    await admitByEmail(first, { productUpdates: true });
    first.unmount();

    const second = openSignup();
    await admitByProvider(second, { productUpdates: false });
    second.unmount();

    expect(await landOnSignupCompleteWithTheNewAccount()).toEqual([TERMS_ONLY]);
  });

  // Pins the browser-wide marker. Whether the older attempt can still finish
  // is the identity provider's decision, not this code's.
  it('carries the choice of the attempt admitted last when two are open in one browser', async () => {
    const olderTab = openSignup();
    await admitByEmail(olderTab, { productUpdates: false });
    const newerTab = openSignup();
    await admitByProvider(newerTab, { productUpdates: true });
    newerTab.unmount();
    olderTab.unmount();

    expect(await landOnSignupCompleteWithTheNewAccount()).toEqual([TERMS_AND_GRANT]);
  });
});
