import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const signInState = vi.hoisted(() => ({
  status: 'needs_first_factor' as string,
  identifier: 'person@example.com' as string | null,
  supportedFirstFactors: [] as { strategy: string; safeIdentifier?: string }[],
  supportedSecondFactors: [] as { strategy: string; safeIdentifier?: string }[],
  create: vi.fn(),
  password: vi.fn(),
  emailCode: { sendCode: vi.fn(), verifyCode: vi.fn() },
  resetPasswordEmailCode: { sendCode: vi.fn(), verifyCode: vi.fn(), submitPassword: vi.fn() },
  mfa: {
    sendPhoneCode: vi.fn(),
    sendEmailCode: vi.fn(),
    verifyTOTP: vi.fn(),
    verifyPhoneCode: vi.fn(),
    verifyEmailCode: vi.fn(),
    verifyBackupCode: vi.fn(),
  },
  sso: vi.fn(),
  passkey: vi.fn(),
  finalize: vi.fn(),
  reset: vi.fn(),
}));

const signUpState = vi.hoisted(() => ({
  status: 'missing_requirements' as string,
  emailAddress: 'person@example.com' as string | null,
  missingFields: [] as string[],
  unverifiedFields: ['email_address'] as string[],
  createdSessionId: null as string | null,
  create: vi.fn(),
  password: vi.fn(),
  verifications: {
    emailAddress: { status: null as string | null },
    sendEmailCode: vi.fn(),
    verifyEmailCode: vi.fn(),
  },
  sso: vi.fn(),
  finalize: vi.fn(),
  reset: vi.fn(),
}));

const clerkState = vi.hoisted(() => ({
  loaded: true,
  listeners: new Set<() => void>(),
  on: vi.fn(),
  off: vi.fn(),
  signOut: vi.fn(),
  client: { sessions: [] as { id: string; remove: () => Promise<unknown> }[] },
}));

vi.mock('@clerk/nextjs', () => ({
  AuthenticateWithRedirectCallback: () => null,
  useClerk: () => clerkState,
  useSignIn: () => ({ signIn: signInState, errors: null, fetchStatus: 'idle' }),
  useSignUp: () => ({ signUp: signUpState, errors: null, fetchStatus: 'idle' }),
}));

import { useIdentityAuthClient } from '../identityAuthAdapter';
import type { AuthMode } from '../authContract';
import { AUTH_ERROR_SOURCE_COPY } from '@/lib/auth/error-taxonomy.copy';

const REDIRECTS = {
  completeUrl: '/login/complete?redirectTo=%2Fchat',
  switchUrl: '/signup',
  ssoCallbackUrl: '/auth/sso-callback?redirectTo=%2Fchat',
};

const EMAIL = 'person@example.com';
const NAVIGABLE_HASH = '#complete';

function client(mode: AuthMode) {
  return renderHook(() => useIdentityAuthClient(mode, REDIRECTS)).result;
}

const ok = { error: null };

beforeEach(() => {
  clerkState.loaded = true;
  clerkState.listeners.clear();
  clerkState.client.sessions = [];
  clerkState.signOut.mockReset().mockImplementation(async () => {
    clerkState.client.sessions = [];
  });
  clerkState.on.mockReset().mockImplementation((_event, listener) => {
    clerkState.listeners.add(listener);
  });
  clerkState.off.mockReset().mockImplementation((_event, listener) => {
    clerkState.listeners.delete(listener);
  });
  signInState.status = 'needs_first_factor';
  signInState.identifier = EMAIL;
  signInState.supportedFirstFactors = [];
  signInState.supportedSecondFactors = [];
  signUpState.status = 'missing_requirements';
  signUpState.emailAddress = EMAIL;
  signUpState.missingFields = [];
  signUpState.unverifiedFields = ['email_address'];
  signUpState.createdSessionId = null;
  signUpState.verifications.emailAddress.status = null;
  for (const fn of [
    signInState.create,
    signInState.password,
    signInState.emailCode.sendCode,
    signInState.emailCode.verifyCode,
    signInState.resetPasswordEmailCode.sendCode,
    signInState.resetPasswordEmailCode.verifyCode,
    signInState.resetPasswordEmailCode.submitPassword,
    signInState.mfa.sendPhoneCode,
    signInState.mfa.sendEmailCode,
    signInState.mfa.verifyTOTP,
    signInState.mfa.verifyPhoneCode,
    signInState.mfa.verifyEmailCode,
    signInState.mfa.verifyBackupCode,
    signInState.sso,
    signInState.passkey,
    signInState.finalize,
    signInState.reset,
    signUpState.create,
    signUpState.password,
    signUpState.verifications.sendEmailCode,
    signUpState.verifications.verifyEmailCode,
    signUpState.sso,
    signUpState.finalize,
    signUpState.reset,
  ]) {
    fn.mockReset();
    fn.mockResolvedValue(ok);
  }
});

describe('identity auth adapter contract', () => {
  it('observes readiness changes without a provider context rerender', () => {
    clerkState.loaded = false;
    const { result, unmount } = renderHook(() => useIdentityAuthClient('login', REDIRECTS));
    expect(result.current.isReady).toBe(false);
    act(() => {
      clerkState.loaded = true;
      clerkState.listeners.forEach((listener) => listener());
    });
    expect(result.current.isReady).toBe(true);
    act(() => {
      clerkState.loaded = false;
      clerkState.listeners.forEach((listener) => listener());
    });
    expect(result.current.isReady).toBe(false);
    unmount();
    expect(clerkState.listeners.size).toBe(0);
    expect(clerkState.off).toHaveBeenCalledWith('status', expect.any(Function));
  });

  it('recovers readiness when loading completes between render and subscription', () => {
    clerkState.loaded = false;
    clerkState.on.mockImplementation((_event, listener) => {
      clerkState.loaded = true;
      clerkState.listeners.add(listener);
    });
    const result = client('login');
    expect(result.current.isReady).toBe(true);
  });

  it('sends an account with a password to the password step', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'password' }, { strategy: 'email_code' }];

    const result = await client('login').current.startWithEmail(EMAIL);

    expect(signInState.create).toHaveBeenCalledWith({ identifier: EMAIL });
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'password', email: EMAIL, methods: ['password', 'email_code'] },
    });
  });

  it('emails a code when the account has no password', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'email_code' }];

    const result = await client('login').current.startWithEmail(EMAIL);

    expect(signInState.emailCode.sendCode).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'sign_in', methods: ['email_code'] },
    });
  });

  it('offers sign-up when no account uses the email', async () => {
    signInState.create.mockResolvedValue({
      error: {
        code: 'api_response_error',
        errors: [{ code: 'form_identifier_not_found', meta: { paramName: 'identifier' } }],
      },
    });

    const result = await client('login').current.startWithEmail(EMAIL);

    expect(result).toEqual({
      status: 'failed',
      kind: 'identifier_not_found',
      message: AUTH_ERROR_SOURCE_COPY.identifier_not_found.message,
      field: 'email',
      switchMode: true,
    });
  });

  it('offers log in when the email already has an account', async () => {
    signUpState.create.mockResolvedValue({
      error: {
        code: 'api_response_error',
        errors: [{ code: 'form_identifier_exists', meta: { paramName: 'emailAddress' } }],
      },
    });

    const result = await client('signup').current.startWithEmail(EMAIL);

    expect(result).toEqual({
      status: 'failed',
      kind: 'identifier_exists',
      message: AUTH_ERROR_SOURCE_COPY.identifier_exists.message,
      field: 'email',
      switchMode: true,
    });
  });

  it('records terms acceptance on the account it creates', async () => {
    await client('signup').current.startWithEmail(EMAIL);

    expect(signUpState.create).toHaveBeenCalledWith({
      emailAddress: EMAIL,
      legalAccepted: true,
    });
    expect(signUpState.verifications.sendEmailCode).toHaveBeenCalled();
  });

  it('finalises a completed sign-in to the redirect the page chose', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'password' }];
    signInState.status = 'complete';

    const result = await client('login').current.submitPassword('secret');

    expect(signInState.finalize).toHaveBeenCalled();
    expect(result).toEqual({ status: 'complete' });

    const navigate = signInState.finalize.mock.calls[0]?.[0]?.navigate as (params: {
      decorateUrl: (url: string) => string;
    }) => void;
    const decorated: string[] = [];
    navigate({
      decorateUrl: (url) => {
        decorated.push(url);
        return NAVIGABLE_HASH;
      },
    });
    expect(decorated).toEqual([REDIRECTS.completeUrl]);
  });

  it('signs in with a discoverable passkey and finalises the session', async () => {
    signInState.passkey.mockImplementation(async () => {
      signInState.status = 'complete';
      return ok;
    });

    const result = await client('login').current.signInWithPasskey();

    expect(signInState.passkey).toHaveBeenCalledWith({ flow: 'discoverable' });
    expect(signInState.finalize).toHaveBeenCalled();
    expect(result).toEqual({ status: 'complete' });
  });

  it('says nothing when the person dismisses the passkey prompt', async () => {
    signInState.passkey.mockResolvedValue({
      error: { code: 'passkey_retrieval_cancelled', message: 'cancelled' },
    });

    const result = await client('login').current.signInWithPasskey();

    expect(result).toEqual({
      status: 'failed',
      kind: 'passkey_dismissed',
      message: AUTH_ERROR_SOURCE_COPY.passkey_dismissed.message,
    });
    expect(signInState.finalize).not.toHaveBeenCalled();
  });

  it('routes a second factor to the authenticator step', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'password' }];
    signInState.status = 'needs_second_factor';
    signInState.supportedSecondFactors = [{ strategy: 'totp' }];

    const result = await client('login').current.submitPassword('secret');

    expect(result).toEqual({
      status: 'next',
      step: {
        kind: 'second_factor',
        factor: { kind: 'authenticator', label: 'Authenticator code', hint: null },
        alternatives: [],
      },
    });
  });

  it('sends a text-message factor before asking for its code', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'password' }];
    signInState.status = 'needs_second_factor';
    signInState.supportedSecondFactors = [{ strategy: 'phone_code', safeIdentifier: '+1 555' }];

    await client('login').current.submitPassword('secret');

    expect(signInState.mfa.sendPhoneCode).toHaveBeenCalled();
  });

  it('turns a forgotten password into a reset code step', async () => {
    const result = await client('login').current.startPasswordReset();

    expect(signInState.resetPasswordEmailCode.sendCode).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'reset', methods: [] },
    });
  });

  it('verifies a reset code and then asks for a new password', async () => {
    const result = await client('login').current.submitCode('123456', 'reset');

    expect(signInState.resetPasswordEmailCode.verifyCode).toHaveBeenCalledWith({ code: '123456' });
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'new_password', email: EMAIL, purpose: 'reset' },
    });
  });

  it('verifies a sign-up code through the sign-up resource', async () => {
    signUpState.verifications.verifyEmailCode.mockImplementation(async () => {
      signUpState.verifications.emailAddress.status = 'verified';
      signUpState.status = 'complete';
      return ok;
    });

    const result = await client('signup').current.submitCode('123456', 'sign_up');

    expect(signUpState.verifications.verifyEmailCode).toHaveBeenCalledWith({ code: '123456' });
    expect(signUpState.finalize).toHaveBeenCalled();
    expect(result).toEqual({ status: 'complete' });
  });

  it('hands a provider sign-in to the callback route the page chose', async () => {
    const result = await client('login').current.startProvider('google');

    expect(signInState.sso).toHaveBeenCalledWith({
      strategy: 'oauth_google',
      redirectUrl: REDIRECTS.completeUrl,
      redirectCallbackUrl: REDIRECTS.ssoCallbackUrl,
    });
    expect(result).toEqual({ status: 'redirecting' });
  });

  it('records the agreement on a provider sign-up, since signing up is the agreement', async () => {
    const result = await client('signup').current.startProvider('github');

    expect(signUpState.sso).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: 'oauth_github', legalAccepted: true }),
    );
    expect(result).toEqual({ status: 'redirecting' });
  });

  it('carries terms acceptance into a provider sign-up', async () => {
    await client('signup').current.startProvider('github');

    expect(signUpState.sso).toHaveBeenCalledWith({
      strategy: 'oauth_github',
      redirectUrl: REDIRECTS.completeUrl,
      redirectCallbackUrl: REDIRECTS.ssoCallbackUrl,
      legalAccepted: true,
    });
  });

  it('answers a wrong password with our own copy rather than the vendor sentence', async () => {
    signInState.password.mockResolvedValue({
      error: {
        code: 'api_response_error',
        errors: [
          {
            code: 'form_password_incorrect',
            longMessage: 'Password is incorrect. Try again, or use another method.',
            meta: { paramName: 'password' },
          },
        ],
      },
    });

    const result = await client('login').current.submitPassword('wrong');

    expect(result).toEqual({
      status: 'failed',
      kind: 'credentials_invalid',
      message: AUTH_ERROR_SOURCE_COPY.credentials_invalid.message,
      field: 'password',
    });
  });

  it('keeps an unmodelled form-validation sentence, which is about the input given', async () => {
    signInState.resetPasswordEmailCode.submitPassword.mockResolvedValue({
      error: {
        code: 'api_response_error',
        errors: [
          {
            code: 'form_password_pwned',
            longMessage: 'This password has been found in a breach.',
            meta: { paramName: 'password' },
          },
        ],
      },
    });

    const result = await client('login').current.submitNewPassword('hunter2', 'reset');

    expect(result).toEqual({
      status: 'failed',
      kind: 'unexpected',
      message: 'This password has been found in a breach.',
      field: 'password',
    });
  });

  it('turns a rate limit into its own screen rather than an inline message', async () => {
    signInState.create.mockResolvedValue({
      error: { status: 429, code: 'too_many_requests', retryAfter: 42 },
    });

    const result = await client('login').current.startWithEmail(EMAIL);

    expect(result).toEqual({
      status: 'next',
      step: { kind: 'notice', notice: 'rate_limited', retryAfterSeconds: 42 },
    });
  });

  it('keeps a resend rate limit inline, where the resend control lives', async () => {
    signInState.emailCode.sendCode.mockResolvedValue({
      error: { status: 429, code: 'too_many_requests', retryAfter: 20 },
    });

    const result = await client('login').current.resendCode('sign_in');

    expect(result).toEqual({
      status: 'failed',
      kind: 'rate_limited',
      message: AUTH_ERROR_SOURCE_COPY.rate_limited.message,
      retryAfterSeconds: 20,
    });
  });

  it('hides an emailed second factor unless the deployment policy allows it', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'password' }];
    signInState.status = 'needs_second_factor';
    signInState.supportedSecondFactors = [{ strategy: 'email_code' }, { strategy: 'totp' }];

    const guarded = await client('login').current.submitPassword('secret');
    expect(guarded).toEqual({
      status: 'next',
      step: {
        kind: 'second_factor',
        factor: { kind: 'authenticator', label: 'Authenticator code', hint: null },
        alternatives: [],
      },
    });

    const permitted = renderHook(() =>
      useIdentityAuthClient('login', REDIRECTS, { mfaEmailFallback: true }),
    ).result;
    const opened = await permitted.current.submitPassword('secret');
    expect(opened).toEqual({
      status: 'next',
      step: {
        kind: 'second_factor',
        factor: { kind: 'authenticator', label: 'Authenticator code', hint: null },
        alternatives: [{ kind: 'email', label: 'Emailed code', hint: null }],
      },
    });
  });

  it('sends a fresh code when the person switches to another second factor', async () => {
    const factor = { kind: 'email', label: 'Emailed code', hint: null } as const;
    signInState.supportedSecondFactors = [{ strategy: 'email_code' }];

    const permitted = renderHook(() =>
      useIdentityAuthClient('login', REDIRECTS, { mfaEmailFallback: true }),
    ).result;
    const result = await permitted.current.switchSecondFactor(factor);

    expect(signInState.mfa.sendEmailCode).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'second_factor', factor, alternatives: [] },
    });
  });
});

describe('sign-up when the identity provider requires a password', () => {
  const PASSWORD = 'a long passphrase';

  beforeEach(() => {
    signUpState.missingFields = ['password'];
  });

  it('emails the code before it asks for a password', async () => {
    const result = await client('signup').current.startWithEmail(EMAIL);

    expect(signUpState.verifications.sendEmailCode).toHaveBeenCalled();
    expect(signUpState.password).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'sign_up', methods: [] },
    });
  });

  it('asks for the password once the code proves the address', async () => {
    signUpState.verifications.verifyEmailCode.mockImplementation(async () => {
      signUpState.unverifiedFields = [];
      signUpState.verifications.emailAddress.status = 'verified';
      return ok;
    });

    const result = await client('signup').current.submitCode('424242', 'sign_up');

    expect(signUpState.verifications.verifyEmailCode).toHaveBeenCalledWith({ code: '424242' });
    expect(signUpState.password).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'new_password', email: EMAIL, purpose: 'sign_up' },
    });
  });

  it('opens the session once the password completes the account', async () => {
    signUpState.unverifiedFields = [];
    signUpState.verifications.emailAddress.status = 'verified';
    signUpState.password.mockImplementation(async () => {
      signUpState.missingFields = [];
      signUpState.status = 'complete';
      return ok;
    });

    const result = await client('signup').current.submitNewPassword(PASSWORD, 'sign_up');

    expect(signUpState.password).toHaveBeenCalledWith({ password: PASSWORD });
    expect(signInState.resetPasswordEmailCode.submitPassword).not.toHaveBeenCalled();
    expect(signUpState.finalize).toHaveBeenCalled();
    expect(result).toEqual({ status: 'complete' });
  });

  it('will not set a password on a sign-up whose address is still unproven', async () => {
    const result = await client('signup').current.submitNewPassword(PASSWORD, 'sign_up');

    expect(signUpState.password).not.toHaveBeenCalled();
    expect(signUpState.finalize).not.toHaveBeenCalled();
    expect(signUpState.verifications.sendEmailCode).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'sign_up', methods: [] },
    });
  });

  it('keeps a password the provider refuses on the field, with the rule it broke', async () => {
    signUpState.verifications.emailAddress.status = 'verified';
    signUpState.password.mockResolvedValue({
      error: {
        code: 'api_response_error',
        errors: [
          {
            code: 'form_password_length_too_short',
            longMessage: 'Passwords must be 8 characters or more.',
            meta: { paramName: 'password' },
          },
        ],
      },
    });

    const result = await client('signup').current.submitNewPassword('short', 'sign_up');

    expect(result).toEqual({
      status: 'failed',
      kind: 'unexpected',
      message: 'Passwords must be 8 characters or more.',
      field: 'password',
    });
    expect(signUpState.verifications.sendEmailCode).not.toHaveBeenCalled();
  });

  it('tells the person how to make a password the provider calls too weak stronger', async () => {
    signUpState.verifications.emailAddress.status = 'verified';
    signUpState.password.mockResolvedValue({
      error: {
        code: 'api_response_error',
        errors: [
          {
            code: 'form_password_not_strong_enough',
            longMessage: 'Given password is not strong enough.',
            meta: {
              paramName: 'password',
              zxcvbn: {
                suggestions: [
                  { code: 'useWords', message: 'Use multiple words, but avoid common phrases.' },
                  { code: 'sequences', message: 'Avoid common character sequences.' },
                ],
              },
            },
          },
        ],
      },
    });

    const result = await client('signup').current.submitNewPassword('password1', 'sign_up');

    expect(result).toEqual({
      status: 'failed',
      kind: 'unexpected',
      message:
        'Given password is not strong enough. Use multiple words, but avoid common phrases. Avoid common character sequences.',
      field: 'password',
    });
    expect(signUpState.finalize).not.toHaveBeenCalled();
  });
});

describe('sign-up on an identity instance that does not require a verified email', () => {
  const PASSWORD = 'a long passphrase';

  beforeEach(() => {
    signUpState.missingFields = ['password'];
    signUpState.unverifiedFields = [];
    signUpState.password.mockImplementation(async () => {
      signUpState.missingFields = [];
      signUpState.status = 'complete';
      return ok;
    });
    signUpState.verifications.verifyEmailCode.mockImplementation(async () => {
      signUpState.verifications.emailAddress.status = 'verified';
      return ok;
    });
  });

  it('proves the address with the emailed code before the password can complete the account', async () => {
    const started = await client('signup').current.startWithEmail(EMAIL);
    expect(started).toEqual({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'sign_up', methods: [] },
    });

    const proven = await client('signup').current.submitCode('424242', 'sign_up');
    expect(proven).toEqual({
      status: 'next',
      step: { kind: 'new_password', email: EMAIL, purpose: 'sign_up' },
    });

    const finished = await client('signup').current.submitNewPassword(PASSWORD, 'sign_up');
    expect(finished).toEqual({ status: 'complete' });

    const verified = signUpState.verifications.verifyEmailCode.mock.invocationCallOrder[0];
    expect(verified).toBeLessThan(signUpState.password.mock.invocationCallOrder[0]!);
    expect(verified).toBeLessThan(signUpState.finalize.mock.invocationCallOrder[0]!);
  });
});

describe('sign-up when the identity provider needs no password', () => {
  it('emails the code after the address and opens the session after the code', async () => {
    const started = await client('signup').current.startWithEmail(EMAIL);
    expect(started).toEqual({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'sign_up', methods: [] },
    });

    signUpState.verifications.verifyEmailCode.mockImplementation(async () => {
      signUpState.unverifiedFields = [];
      signUpState.verifications.emailAddress.status = 'verified';
      signUpState.status = 'complete';
      return ok;
    });
    const finished = await client('signup').current.submitCode('424242', 'sign_up');

    expect(finished).toEqual({ status: 'complete' });
    expect(signUpState.finalize).toHaveBeenCalled();
    expect(signUpState.password).not.toHaveBeenCalled();
  });

  it('names a requirement this page cannot collect instead of a generic failure', async () => {
    signUpState.missingFields = ['first_name'];

    const result = await client('signup').current.startWithEmail(EMAIL);

    expect(result).toMatchObject({ status: 'failed', kind: 'unexpected' });
    expect(result.status === 'failed' ? result.message : '').toContain('first name');
    expect(result.status === 'failed' ? result.message : '').not.toBe(
      AUTH_ERROR_SOURCE_COPY.unexpected.message,
    );
    expect(signUpState.verifications.sendEmailCode).not.toHaveBeenCalled();
  });
});

describe('sign-up when the identity provider needs no password and does not verify the address', () => {
  const UNPROVEN_SESSION = 'sess_unproven';
  const UNCONFIRMED = `Your account for ${EMAIL} was created, but we could not confirm the address, so we did not sign you in. Contact support to finish setting it up.`;
  const removeSession = vi.fn();

  beforeEach(() => {
    removeSession.mockReset().mockResolvedValue({});
    clerkState.client.sessions = [{ id: UNPROVEN_SESSION, remove: removeSession }];
    signUpState.create.mockImplementation(async () => {
      signUpState.status = 'complete';
      signUpState.createdSessionId = UNPROVEN_SESSION;
      return ok;
    });
    signInState.create.mockImplementation(async () => {
      signInState.supportedFirstFactors = [{ strategy: 'email_code' }];
      return ok;
    });
  });

  it('withholds the session the sign-up opened and emails a code to the address instead', async () => {
    const result = await client('signup').current.startWithEmail(EMAIL);

    expect(signUpState.finalize).not.toHaveBeenCalled();
    expect(signInState.finalize).not.toHaveBeenCalled();
    expect(removeSession).toHaveBeenCalledTimes(1);
    expect(signInState.create).toHaveBeenCalledWith({ identifier: EMAIL });
    expect(removeSession.mock.invocationCallOrder[0]).toBeLessThan(
      signInState.create.mock.invocationCallOrder[0]!,
    );
    expect(signInState.emailCode.sendCode).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'sign_in', methods: ['email_code'] },
    });
  });

  it('opens a session only after the emailed code proves the address', async () => {
    const started = await client('signup').current.startWithEmail(EMAIL);
    expect(started).toMatchObject({ status: 'next', step: { kind: 'code', purpose: 'sign_in' } });

    signInState.emailCode.verifyCode.mockImplementation(async () => {
      signInState.status = 'complete';
      return ok;
    });
    const finished = await client('signup').current.submitCode('424242', 'sign_in');

    expect(finished).toEqual({ status: 'complete' });
    expect(signUpState.finalize).not.toHaveBeenCalled();
    expect(signInState.emailCode.verifyCode).toHaveBeenCalledWith({ code: '424242' });
    expect(signInState.emailCode.verifyCode.mock.invocationCallOrder[0]).toBeLessThan(
      signInState.finalize.mock.invocationCallOrder[0]!,
    );
  });

  it('names the address it could not confirm rather than opening the account', async () => {
    signInState.create.mockResolvedValue({
      error: {
        code: 'api_response_error',
        errors: [{ code: 'form_identifier_not_found', meta: { paramName: 'identifier' } }],
      },
    });

    const result = await client('signup').current.startWithEmail(EMAIL);

    expect(result).toMatchObject({ status: 'failed' });
    const message = result.status === 'failed' ? result.message : '';
    expect(message).toContain(EMAIL);
    expect(message).not.toBe(AUTH_ERROR_SOURCE_COPY.identifier_not_found.message);
    expect(result).not.toHaveProperty('switchMode');
    expect(signUpState.finalize).not.toHaveBeenCalled();
    expect(signInState.finalize).not.toHaveBeenCalled();
  });

  it('says the account was created but not signed in when the confirming sign-in cannot start', async () => {
    signInState.create.mockResolvedValueOnce({
      error: { code: 'api_response_error', errors: [{ code: 'unexpected_error' }] },
    });

    const result = await client('signup').current.startWithEmail(EMAIL);

    expect(result).toMatchObject({ status: 'failed', message: UNCONFIRMED });
    expect(removeSession).toHaveBeenCalledTimes(1);
    expect(signInState.emailCode.sendCode).not.toHaveBeenCalled();
    expect(signUpState.finalize).not.toHaveBeenCalled();
    expect(signInState.finalize).not.toHaveBeenCalled();
  });

  it('signs the client out on this page when the session the sign-up opened cannot be removed', async () => {
    removeSession.mockRejectedValueOnce(new Error('session removal failed'));

    const result = await client('signup').current.startWithEmail(EMAIL);

    expect(clerkState.signOut).toHaveBeenCalledTimes(1);
    expect(clerkState.signOut).toHaveBeenCalledWith(expect.any(Function));
    expect(clerkState.client.sessions).toEqual([]);
    expect(result).toMatchObject({ status: 'failed', message: UNCONFIRMED });
    expect(signInState.create).not.toHaveBeenCalled();
    expect(signUpState.finalize).not.toHaveBeenCalled();
    expect(signInState.finalize).not.toHaveBeenCalled();
  });

  it('signs the client out on this page when the session the sign-up opened is not one it lists', async () => {
    const removeOther = vi.fn().mockResolvedValue({});
    clerkState.client.sessions = [{ id: 'sess_someone_else', remove: removeOther }];

    const result = await client('signup').current.startWithEmail(EMAIL);

    expect(removeOther).not.toHaveBeenCalled();
    expect(clerkState.signOut).toHaveBeenCalledTimes(1);
    expect(clerkState.signOut).toHaveBeenCalledWith(expect.any(Function));
    expect(clerkState.client.sessions).toEqual([]);
    expect(clerkState.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      signInState.create.mock.invocationCallOrder[0]!,
    );
    expect(result).toMatchObject({ status: 'next', step: { kind: 'code', purpose: 'sign_in' } });
    expect(signUpState.finalize).not.toHaveBeenCalled();
    expect(signInState.finalize).not.toHaveBeenCalled();
  });

  it('starts no confirming sign-in when that sign-out fails', async () => {
    clerkState.client.sessions = [];
    clerkState.signOut.mockRejectedValueOnce(new Error('sign-out failed'));

    const result = await client('signup').current.startWithEmail(EMAIL);

    expect(clerkState.signOut).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'failed', message: UNCONFIRMED });
    expect(signInState.create).not.toHaveBeenCalled();
    expect(signUpState.finalize).not.toHaveBeenCalled();
    expect(signInState.finalize).not.toHaveBeenCalled();
  });

  it('says the confirming code was not sent when sending it fails', async () => {
    signInState.emailCode.sendCode.mockResolvedValueOnce({
      error: { code: 'api_response_error', errors: [{ code: 'unexpected_error' }] },
    });

    const result = await client('signup').current.startWithEmail(EMAIL);

    expect(signInState.emailCode.sendCode).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'failed',
      message: `Your account for ${EMAIL} was created, but we could not send the code that confirms the address, so we did not sign you in. Contact support to finish setting it up.`,
    });
    expect(clerkState.signOut).not.toHaveBeenCalled();
    expect(signUpState.finalize).not.toHaveBeenCalled();
    expect(signInState.finalize).not.toHaveBeenCalled();
  });
});

describe('sign-in with the address and the password in one action', () => {
  const PASSWORD = 'correct horse battery';
  const WRONG_PASSWORD = {
    error: {
      code: 'api_response_error',
      errors: [
        {
          code: 'form_password_incorrect',
          longMessage: 'Password is incorrect. Try again, or use another method.',
          meta: { paramName: 'password' },
        },
      ],
    },
  };

  function everyProviderCall(): unknown[][] {
    return [
      signInState.create,
      signInState.password,
      signInState.emailCode.sendCode,
      signInState.emailCode.verifyCode,
      signInState.resetPasswordEmailCode.sendCode,
      signInState.resetPasswordEmailCode.verifyCode,
      signInState.resetPasswordEmailCode.submitPassword,
      signInState.mfa.sendPhoneCode,
      signInState.mfa.sendEmailCode,
      signInState.sso,
      signInState.passkey,
      signInState.finalize,
      signUpState.create,
      signUpState.password,
      signUpState.sso,
    ].flatMap((fn) => fn.mock.calls);
  }

  function expectPasswordSentNowhere() {
    expect(signInState.password).not.toHaveBeenCalled();
    expect(JSON.stringify(everyProviderCall())).not.toContain(PASSWORD);
  }

  beforeEach(() => {
    signInState.supportedFirstFactors = [{ strategy: 'password' }, { strategy: 'email_code' }];
  });

  it('starts the sign-in for the address, sends the password and opens the session', async () => {
    signInState.password.mockImplementation(async () => {
      signInState.status = 'complete';
      return ok;
    });

    const result = await client('login').current.signInWithPassword(EMAIL, PASSWORD);

    expect(signInState.create).toHaveBeenCalledTimes(1);
    expect(signInState.create).toHaveBeenCalledWith({ identifier: EMAIL });
    expect(signInState.password).toHaveBeenCalledTimes(1);
    expect(signInState.password).toHaveBeenCalledWith({ password: PASSWORD });
    expect(signInState.create.mock.invocationCallOrder[0]).toBeLessThan(
      signInState.password.mock.invocationCallOrder[0]!,
    );
    expect(signInState.password.mock.invocationCallOrder[0]).toBeLessThan(
      signInState.finalize.mock.invocationCallOrder[0]!,
    );
    expect(signInState.emailCode.sendCode).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'complete' });
  });

  it('answers a wrong password against the password field and opens nothing', async () => {
    signInState.password.mockResolvedValue(WRONG_PASSWORD);

    const result = await client('login').current.signInWithPassword(EMAIL, 'not the password');

    expect(result).toEqual({
      status: 'failed',
      kind: 'credentials_invalid',
      message: AUTH_ERROR_SOURCE_COPY.credentials_invalid.message,
      field: 'password',
    });
    expect(signInState.finalize).not.toHaveBeenCalled();
    expect(signInState.emailCode.sendCode).not.toHaveBeenCalled();
  });

  it('discards the password for an account that signs in with an emailed code, and says so', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'email_code' }];

    const result = await client('login').current.signInWithPassword(EMAIL, PASSWORD);

    expectPasswordSentNowhere();
    expect(signInState.emailCode.sendCode).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 'next',
      step: {
        kind: 'code',
        email: EMAIL,
        purpose: 'sign_in',
        methods: ['email_code'],
        passwordless: true,
      },
    });
  });

  it('discards the password for an account that signs in with a provider or a passkey', async () => {
    signInState.supportedFirstFactors = [
      { strategy: 'oauth_google' },
      { strategy: 'passkey' },
      { strategy: 'email_code' },
    ];

    const result = await client('login').current.signInWithPassword(EMAIL, PASSWORD);

    expectPasswordSentNowhere();
    expect(result).toMatchObject({
      status: 'next',
      step: { kind: 'code', purpose: 'sign_in', passwordless: true },
    });
  });

  it('discards the password for an address its organization signs in', async () => {
    signInState.supportedFirstFactors = [
      { strategy: 'enterprise_sso' },
      { strategy: 'password' },
      { strategy: 'email_code' },
    ];

    const result = await client('login').current.signInWithPassword(EMAIL, PASSWORD);

    expectPasswordSentNowhere();
    expect(signInState.sso).toHaveBeenCalledWith({
      identifier: EMAIL,
      strategy: 'enterprise_sso',
      redirectUrl: REDIRECTS.completeUrl,
      redirectCallbackUrl: REDIRECTS.ssoCallbackUrl,
    });
    expect(result).toEqual({ status: 'redirecting', phase: 'enterprise_redirecting' });
  });

  it('does not call a device code a missing password when the sign-in is already past its first factor', async () => {
    signInState.status = 'needs_client_trust';
    signInState.supportedSecondFactors = [{ strategy: 'email_code' }];

    const result = await client('login').current.signInWithPassword(EMAIL, PASSWORD);

    expectPasswordSentNowhere();
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'device', methods: [] },
    });
    expect(result).not.toHaveProperty('step.passwordless');
  });

  it('discards the password when no account uses the address, and says no more than before', async () => {
    const unknown = {
      error: {
        code: 'api_response_error',
        errors: [{ code: 'form_identifier_not_found', meta: { paramName: 'identifier' } }],
      },
    };
    signInState.create.mockResolvedValue(unknown);
    const emailFirst = await client('login').current.startWithEmail(EMAIL);

    const result = await client('login').current.signInWithPassword(EMAIL, PASSWORD);

    expectPasswordSentNowhere();
    expect(result).toEqual(emailFirst);
    expect(result).toEqual({
      status: 'failed',
      kind: 'identifier_not_found',
      message: AUTH_ERROR_SOURCE_COPY.identifier_not_found.message,
      field: 'email',
      switchMode: true,
    });
  });

  it('asks for the second factor after a right password', async () => {
    signInState.password.mockImplementation(async () => {
      signInState.status = 'needs_second_factor';
      signInState.supportedSecondFactors = [{ strategy: 'totp' }, { strategy: 'backup_code' }];
      return ok;
    });

    const result = await client('login').current.signInWithPassword(EMAIL, PASSWORD);

    expect(signInState.finalize).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: {
        kind: 'second_factor',
        factor: { kind: 'authenticator', label: 'Authenticator code', hint: null },
        alternatives: [{ kind: 'backup_code', label: 'Backup code', hint: null }],
      },
    });
  });

  it('verifies a new device with an emailed code after a right password', async () => {
    signInState.password.mockImplementation(async () => {
      signInState.status = 'needs_client_trust';
      signInState.supportedSecondFactors = [{ strategy: 'email_code' }];
      return ok;
    });

    const result = await client('login').current.signInWithPassword(EMAIL, PASSWORD);

    expect(signInState.mfa.sendEmailCode).toHaveBeenCalledTimes(1);
    expect(signInState.emailCode.sendCode).not.toHaveBeenCalled();
    expect(signInState.finalize).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'device', methods: [] },
    });
  });

  it('asks for a new password when the provider requires one after a right password', async () => {
    signInState.password.mockImplementation(async () => {
      signInState.status = 'needs_new_password';
      return ok;
    });

    const result = await client('login').current.signInWithPassword(EMAIL, PASSWORD);

    expect(result).toEqual({
      status: 'next',
      step: { kind: 'new_password', email: EMAIL, purpose: 'reset' },
    });
  });

  it('gives a locked account its notice rather than a field message', async () => {
    signInState.password.mockResolvedValue({
      error: { code: 'api_response_error', errors: [{ code: 'user_locked' }] },
    });

    const result = await client('login').current.signInWithPassword(EMAIL, PASSWORD);

    expect(result).toEqual({
      status: 'next',
      step: { kind: 'notice', notice: 'account_locked', retryAfterSeconds: null },
    });
  });

  it('never starts a sign-up, whichever page it is called from', async () => {
    signInState.password.mockImplementation(async () => {
      signInState.status = 'complete';
      return ok;
    });

    const result = await client('signup').current.signInWithPassword(EMAIL, PASSWORD);

    expect(signUpState.create).not.toHaveBeenCalled();
    expect(signUpState.finalize).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'complete' });
  });

  it('leaves the email-first start as it was: no password call and no passwordless mark', async () => {
    const withPassword = await client('login').current.startWithEmail(EMAIL);
    signInState.supportedFirstFactors = [{ strategy: 'email_code' }];
    const withoutPassword = await client('login').current.startWithEmail(EMAIL);

    expect(signInState.password).not.toHaveBeenCalled();
    expect(withPassword).toEqual({
      status: 'next',
      step: { kind: 'password', email: EMAIL, methods: ['password', 'email_code'] },
    });
    expect(withoutPassword).toEqual({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'sign_in', methods: ['email_code'] },
    });
    expect(withoutPassword).not.toHaveProperty('step.passwordless');
  });
});

describe('password recovery for the address typed on the sign-in screen', () => {
  beforeEach(() => {
    signInState.supportedFirstFactors = [{ strategy: 'password' }, { strategy: 'email_code' }];
  });

  it('starts the sign-in for the address and emails the reset code', async () => {
    const result = await client('login').current.startPasswordResetFor(EMAIL);

    expect(signInState.create).toHaveBeenCalledWith({ identifier: EMAIL });
    expect(signInState.resetPasswordEmailCode.sendCode).toHaveBeenCalledTimes(1);
    expect(signInState.create.mock.invocationCallOrder[0]).toBeLessThan(
      signInState.resetPasswordEmailCode.sendCode.mock.invocationCallOrder[0]!,
    );
    expect(signInState.emailCode.sendCode).not.toHaveBeenCalled();
    expect(signInState.password).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'reset', methods: ['password', 'email_code'] },
    });
  });

  it('answers as the existing recovery does once the address is known', async () => {
    const typed = await client('login').current.startPasswordResetFor(EMAIL);
    const fromThePasswordStep = await client('login').current.startPasswordReset();

    expect(typed).toEqual(fromThePasswordStep);
  });

  it('signs an account with no password in by code instead of resetting one, and says so', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'email_code' }];

    const result = await client('login').current.startPasswordResetFor(EMAIL);

    expect(signInState.resetPasswordEmailCode.sendCode).not.toHaveBeenCalled();
    expect(signInState.emailCode.sendCode).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 'next',
      step: {
        kind: 'code',
        email: EMAIL,
        purpose: 'sign_in',
        methods: ['email_code'],
        passwordless: true,
      },
    });
  });

  it('sends no code to an address no account uses', async () => {
    signInState.create.mockResolvedValue({
      error: {
        code: 'api_response_error',
        errors: [{ code: 'form_identifier_not_found', meta: { paramName: 'identifier' } }],
      },
    });

    const result = await client('login').current.startPasswordResetFor(EMAIL);

    expect(signInState.resetPasswordEmailCode.sendCode).not.toHaveBeenCalled();
    expect(signInState.emailCode.sendCode).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'failed',
      kind: 'identifier_not_found',
      field: 'email',
      switchMode: true,
    });
  });

  it('turns a rate-limited reset request into its own screen, as the existing recovery does', async () => {
    signInState.resetPasswordEmailCode.sendCode.mockResolvedValue({
      error: { status: 429, code: 'too_many_requests', retryAfter: 12 },
    });

    const result = await client('login').current.startPasswordResetFor(EMAIL);

    expect(result).toEqual({
      status: 'next',
      step: { kind: 'notice', notice: 'rate_limited', retryAfterSeconds: 12 },
    });
  });
});

describe('password sign-in from a device the account has not used', () => {
  beforeEach(() => {
    signInState.supportedFirstFactors = [{ strategy: 'password' }, { strategy: 'email_code' }];
  });

  it('verifies the device with an emailed code when that is the only second factor offered', async () => {
    signInState.status = 'needs_second_factor';
    signInState.supportedSecondFactors = [{ strategy: 'email_code' }];

    const result = await client('login').current.submitPassword('secret');

    expect(signInState.mfa.sendEmailCode).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'device', methods: [] },
    });
  });

  it('names the address the device code went to rather than the one typed', async () => {
    signInState.identifier = 'second@example.com';
    signInState.status = 'needs_client_trust';
    signInState.supportedSecondFactors = [
      { strategy: 'email_code', safeIdentifier: 'p*****@example.com' },
    ];

    const result = await client('login').current.submitPassword('secret');

    expect(signInState.mfa.sendEmailCode).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'code', email: 'p*****@example.com', purpose: 'device', methods: [] },
    });
  });

  it('verifies the device when the provider asks for client trust', async () => {
    signInState.status = 'needs_client_trust';
    signInState.supportedSecondFactors = [{ strategy: 'email_code' }];

    const result = await client('login').current.submitPassword('secret');

    expect(signInState.mfa.sendEmailCode).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'device', methods: [] },
    });
  });

  it('keeps an authenticator ahead of an emailed code the account also offers', async () => {
    signInState.status = 'needs_second_factor';
    signInState.supportedSecondFactors = [{ strategy: 'email_code' }, { strategy: 'totp' }];

    const result = await client('login').current.submitPassword('secret');

    expect(signInState.mfa.sendEmailCode).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: {
        kind: 'second_factor',
        factor: { kind: 'authenticator', label: 'Authenticator code', hint: null },
        alternatives: [],
      },
    });
  });

  it('keeps an authenticator ahead of an emailed code when the provider asks for client trust', async () => {
    signInState.status = 'needs_client_trust';
    signInState.supportedSecondFactors = [{ strategy: 'email_code' }, { strategy: 'totp' }];

    const result = await client('login').current.submitPassword('secret');

    expect(signInState.mfa.sendEmailCode).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: {
        kind: 'second_factor',
        factor: { kind: 'authenticator', label: 'Authenticator code', hint: null },
        alternatives: [],
      },
    });
  });

  it('checks the device code and opens the session', async () => {
    signInState.mfa.verifyEmailCode.mockImplementation(async () => {
      signInState.status = 'complete';
      return ok;
    });

    const result = await client('login').current.submitCode('424242', 'device');

    expect(signInState.mfa.verifyEmailCode).toHaveBeenCalledWith({ code: '424242' });
    expect(signInState.emailCode.verifyCode).not.toHaveBeenCalled();
    expect(signInState.finalize).toHaveBeenCalled();
    expect(result).toEqual({ status: 'complete' });
  });

  it('sends a fresh device code through the second factor', async () => {
    const result = await client('login').current.resendCode('device');

    expect(signInState.mfa.sendEmailCode).toHaveBeenCalled();
    expect(signInState.emailCode.sendCode).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'sent' });
  });

  it.each(['sign_in', 'sign_up', 'reset', 'device'] as const)(
    'answers a %s resend as sent, never as a finished sign-in',
    async (purpose) => {
      const result = await client(purpose === 'sign_up' ? 'signup' : 'login').current.resendCode(
        purpose,
      );

      expect(result).toEqual({ status: 'sent' });
      expect(signInState.finalize).not.toHaveBeenCalled();
      expect(signUpState.finalize).not.toHaveBeenCalled();
    },
  );
});

describe('a retry after the code was accepted but the session did not open', () => {
  const OFFLINE = { error: new TypeError('Failed to fetch') };
  const SPENT = {
    error: { code: 'api_response_error', errors: [{ code: 'verification_already_verified' }] },
  };
  const INCORRECT = {
    error: {
      code: 'api_response_error',
      errors: [{ code: 'form_code_incorrect', meta: { paramName: 'code' } }],
    },
  };

  it('opens the sign-up session without sending the accepted code again', async () => {
    signUpState.verifications.verifyEmailCode
      .mockImplementationOnce(async () => {
        signUpState.verifications.emailAddress.status = 'verified';
        signUpState.status = 'complete';
        return ok;
      })
      .mockResolvedValue(SPENT);
    signUpState.finalize.mockResolvedValueOnce(OFFLINE);

    const first = await client('signup').current.submitCode('424242', 'sign_up');
    expect(first).toMatchObject({ status: 'failed', kind: 'network_unreachable' });

    const retried = await client('signup').current.submitCode('424242', 'sign_up');

    expect(retried).toEqual({ status: 'complete' });
    expect(signUpState.verifications.verifyEmailCode).toHaveBeenCalledTimes(1);
    expect(signUpState.finalize).toHaveBeenCalledTimes(2);
  });

  it('opens the sign-in session without sending the accepted code again', async () => {
    signInState.emailCode.verifyCode
      .mockImplementationOnce(async () => {
        signInState.status = 'complete';
        return ok;
      })
      .mockResolvedValue(SPENT);
    signInState.finalize.mockResolvedValueOnce(OFFLINE);

    const first = await client('login').current.submitCode('424242', 'sign_in');
    expect(first).toMatchObject({ status: 'failed', kind: 'network_unreachable' });

    const retried = await client('login').current.submitCode('424242', 'sign_in');

    expect(retried).toEqual({ status: 'complete' });
    expect(signInState.emailCode.verifyCode).toHaveBeenCalledTimes(1);
    expect(signInState.finalize).toHaveBeenCalledTimes(2);
  });

  it('opens the session after a device code without sending it again', async () => {
    signInState.status = 'needs_client_trust';
    signInState.mfa.verifyEmailCode
      .mockImplementationOnce(async () => {
        signInState.status = 'complete';
        return ok;
      })
      .mockResolvedValue(SPENT);
    signInState.finalize.mockResolvedValueOnce(OFFLINE);

    const first = await client('login').current.submitCode('424242', 'device');
    expect(first).toMatchObject({ status: 'failed', kind: 'network_unreachable' });

    const retried = await client('login').current.submitCode('424242', 'device');

    expect(retried).toEqual({ status: 'complete' });
    expect(signInState.mfa.verifyEmailCode).toHaveBeenCalledTimes(1);
    expect(signInState.finalize).toHaveBeenCalledTimes(2);
  });

  it('asks for the second factor when the accepted code was only the first one', async () => {
    signInState.emailCode.verifyCode
      .mockImplementationOnce(async () => {
        signInState.status = 'needs_second_factor';
        signInState.supportedSecondFactors = [{ strategy: 'totp' }];
        return ok;
      })
      .mockResolvedValue(SPENT);

    const first = await client('login').current.submitCode('424242', 'sign_in');
    const again = await client('login').current.submitCode('424242', 'sign_in');

    expect(first).toEqual(again);
    expect(again).toEqual({
      status: 'next',
      step: {
        kind: 'second_factor',
        factor: { kind: 'authenticator', label: 'Authenticator code', hint: null },
        alternatives: [],
      },
    });
    expect(signInState.emailCode.verifyCode).toHaveBeenCalledTimes(1);
  });

  it('still checks a code the provider refused, since nothing was accepted yet', async () => {
    signInState.emailCode.verifyCode
      .mockResolvedValueOnce(INCORRECT)
      .mockImplementationOnce(async () => {
        signInState.status = 'complete';
        return ok;
      });

    const refused = await client('login').current.submitCode('111111', 'sign_in');
    const accepted = await client('login').current.submitCode('424242', 'sign_in');

    expect(refused).toMatchObject({ status: 'failed', kind: 'code_incorrect', field: 'code' });
    expect(accepted).toEqual({ status: 'complete' });
    expect(signInState.emailCode.verifyCode).toHaveBeenCalledTimes(2);
  });
});
