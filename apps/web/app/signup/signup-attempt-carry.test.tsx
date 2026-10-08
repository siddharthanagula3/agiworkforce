import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor, within, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ACCOUNT_AGE_FIELD_LABEL } from '@agiworkforce/types';

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
import { MARKETING_EMAIL_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { RecordTermsAcceptance } from './complete/RecordTermsAcceptance';
import {
  MARKETING_EMAIL_ATTEMPT_STORAGE_KEY,
  MARKETING_EMAIL_CHOICE_STORAGE_KEY,
  TERMS_GATE_STORAGE_KEY,
} from './signupAttemptMarkers';

const REDIRECTS = {
  completeUrl: '/signup/complete?redirectTo=%2Fchat',
  switchUrl: '/login',
  ssoCallbackUrl: '/auth/sso-callback?redirectTo=%2Fchat',
};
const PROVIDERS = [{ id: 'google' as const, label: 'Google' }];
const TYPED_AGE = '57';
const TERMS_ONLY = { surface: 'web-signup', version: POLICY_LAST_UPDATED.terms };
const TERMS_AND_GRANT = { ...TERMS_ONLY, marketingEmailNoticeVersion: POLICY_LAST_UPDATED.privacy };

function openSignup(): RenderResult {
  return render(<AuthFlow mode="signup" providers={PROVIDERS} redirects={REDIRECTS} />);
}

async function admitByEmail(tab: RenderResult, { marketingEmail }: { marketingEmail: boolean }) {
  const screen = within(tab.container);
  await userEvent.type(screen.getByLabelText(ACCOUNT_AGE_FIELD_LABEL), TYPED_AGE);
  if (marketingEmail) {
    await userEvent.click(
      screen.getByRole('checkbox', { name: MARKETING_EMAIL_CONSENT_PURPOSE.label }),
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

async function admitByProvider(tab: RenderResult, { marketingEmail }: { marketingEmail: boolean }) {
  const screen = within(tab.container);
  await userEvent.type(screen.getByLabelText(ACCOUNT_AGE_FIELD_LABEL), TYPED_AGE);
  if (marketingEmail) {
    await userEvent.click(
      screen.getByRole('checkbox', { name: MARKETING_EMAIL_CONSENT_PURPOSE.label }),
    );
  }
  const admitted = signUpState.sso.mock.calls.length;
  await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
  await waitFor(() => expect(signUpState.sso.mock.calls.length).toBe(admitted + 1));
}

const ASKED_AGAIN_AT = '/login/complete?redirectTo=%2Fchat';

async function landOnSignupCompleteWithTheNewAccount(
  sentOnTo = '/chat',
): Promise<Record<string, unknown>[]> {
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
  await waitFor(() => expect(session.replace).toHaveBeenCalledWith(sentOnTo));
  expect(session.replace).toHaveBeenCalledTimes(1);
  return (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
    ([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>,
  );
}

type TabSession = Record<string, string>;

function switchAwayFromTab(): TabSession {
  const held: TabSession = {};
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);
    if (key !== null) held[key] = window.sessionStorage.getItem(key) ?? '';
  }
  window.sessionStorage.clear();
  return held;
}

function switchBackToTab(held: TabSession): void {
  window.sessionStorage.clear();
  for (const [key, value] of Object.entries(held)) window.sessionStorage.setItem(key, value);
}

function everyMarker(): (string | null)[] {
  return [
    window.localStorage.getItem(TERMS_GATE_STORAGE_KEY),
    window.localStorage.getItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY),
    window.localStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY),
    window.sessionStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY),
  ];
}

describe('a sign-up attempt carried from the sign-up screen to the account', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
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
      await admit(tab, { marketingEmail: true });
      tab.unmount();

      expect(await landOnSignupCompleteWithTheNewAccount()).toEqual([TERMS_AND_GRANT]);
      expect(everyMarker()).toEqual([null, null, null, null]);
    },
  );

  it.each([
    ['the email step', admitByEmail],
    ['a provider round trip', admitByProvider],
  ])('sends the terms alone when the box was left empty before %s', async (_path, admit) => {
    const tab = openSignup();
    await admit(tab, { marketingEmail: false });
    tab.unmount();

    expect(await landOnSignupCompleteWithTheNewAccount()).toEqual([TERMS_ONLY]);
  });

  it('sends nothing ticked by a person who then started again with the box empty', async () => {
    const first = openSignup();
    await admitByEmail(first, { marketingEmail: true });
    first.unmount();

    const second = openSignup();
    await admitByProvider(second, { marketingEmail: false });
    second.unmount();

    expect(await landOnSignupCompleteWithTheNewAccount()).toEqual([TERMS_ONLY]);
  });
});

describe('two sign-up attempts open in one browser', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
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

  async function admitInItsOwnTab(
    admit: typeof admitByEmail,
    choice: { marketingEmail: boolean },
  ): Promise<TabSession> {
    const tab = openSignup();
    await admit(tab, choice);
    tab.unmount();
    return switchAwayFromTab();
  }

  it('records nothing for the older attempt when only the newer tab ticked the box, and asks again', async () => {
    const olderTab = await admitInItsOwnTab(admitByEmail, { marketingEmail: false });
    await admitInItsOwnTab(admitByProvider, { marketingEmail: true });

    switchBackToTab(olderTab);

    expect(await landOnSignupCompleteWithTheNewAccount(ASKED_AGAIN_AT)).toEqual([]);
    expect(everyMarker()).toEqual([null, null, null, null]);
  });

  it('records the choice for the newer attempt, in the tab that ticked it', async () => {
    await admitInItsOwnTab(admitByEmail, { marketingEmail: false });
    const newerTab = await admitInItsOwnTab(admitByProvider, { marketingEmail: true });

    switchBackToTab(newerTab);

    expect(await landOnSignupCompleteWithTheNewAccount()).toEqual([TERMS_AND_GRANT]);
  });

  it('records nothing for the older attempt when both tabs ticked the box, and asks again', async () => {
    const olderTab = await admitInItsOwnTab(admitByEmail, { marketingEmail: true });
    await admitInItsOwnTab(admitByProvider, { marketingEmail: true });

    switchBackToTab(olderTab);

    expect(await landOnSignupCompleteWithTheNewAccount(ASKED_AGAIN_AT)).toEqual([]);
    expect(everyMarker()).toEqual([null, null, null, null]);
  });

  it('records nothing for the older attempt whose ticked choice the newer tab removed, and asks again', async () => {
    const olderTab = await admitInItsOwnTab(admitByEmail, { marketingEmail: true });
    await admitInItsOwnTab(admitByProvider, { marketingEmail: false });

    switchBackToTab(olderTab);

    expect(await landOnSignupCompleteWithTheNewAccount(ASKED_AGAIN_AT)).toEqual([]);
    expect(everyMarker()).toEqual([null, null, null, null]);
  });

  it('records the terms alone for the newer attempt that left the box empty', async () => {
    await admitInItsOwnTab(admitByEmail, { marketingEmail: true });
    const newerTab = await admitInItsOwnTab(admitByProvider, { marketingEmail: false });

    switchBackToTab(newerTab);

    expect(await landOnSignupCompleteWithTheNewAccount()).toEqual([TERMS_ONLY]);
  });

  it('records nothing in a tab that never held the attempt, such as a link opened elsewhere', async () => {
    await admitInItsOwnTab(admitByEmail, { marketingEmail: true });

    expect(await landOnSignupCompleteWithTheNewAccount(ASKED_AGAIN_AT)).toEqual([]);
    expect(everyMarker()).toEqual([null, null, null, null]);
  });
});
