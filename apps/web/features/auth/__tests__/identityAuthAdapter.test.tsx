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
  create: vi.fn(),
  verifications: { sendEmailCode: vi.fn(), verifyEmailCode: vi.fn() },
  sso: vi.fn(),
  finalize: vi.fn(),
  reset: vi.fn(),
}));

const clerkState = vi.hoisted(() => ({
  loaded: true,
  listeners: new Set<() => void>(),
  on: vi.fn(),
  off: vi.fn(),
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
    expect(result).toEqual({ status: 'next', step: { kind: 'new_password', email: EMAIL } });
  });

  it('verifies a sign-up code through the sign-up resource', async () => {
    signUpState.status = 'complete';

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

    const result = await client('login').current.submitNewPassword('hunter2');

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
