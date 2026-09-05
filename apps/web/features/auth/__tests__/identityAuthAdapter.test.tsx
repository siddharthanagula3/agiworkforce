import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

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
    verifyTOTP: vi.fn(),
    verifyPhoneCode: vi.fn(),
    verifyBackupCode: vi.fn(),
  },
  sso: vi.fn(),
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

vi.mock('@clerk/nextjs', () => ({
  AuthenticateWithRedirectCallback: () => null,
  useClerk: () => ({ loaded: true }),
  useSignIn: () => ({ signIn: signInState, errors: null, fetchStatus: 'idle' }),
  useSignUp: () => ({ signUp: signUpState, errors: null, fetchStatus: 'idle' }),
}));

import { useIdentityAuthClient } from '../identityAuthAdapter';
import {
  ACCOUNT_ALREADY_EXISTS,
  NO_ACCOUNT_FOR_EMAIL,
  TERMS_NOT_ACCEPTED,
  type AuthMode,
} from '../authContract';

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
    signInState.mfa.verifyTOTP,
    signInState.mfa.verifyPhoneCode,
    signInState.mfa.verifyBackupCode,
    signInState.sso,
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
  it('sends an account with a password to the password step', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'password' }, { strategy: 'email_code' }];

    const result = await client('login').current.startWithEmail(EMAIL, false);

    expect(signInState.create).toHaveBeenCalledWith({ identifier: EMAIL });
    expect(result).toEqual({ status: 'next', step: { kind: 'password', email: EMAIL } });
  });

  it('emails a code when the account has no password', async () => {
    signInState.supportedFirstFactors = [{ strategy: 'email_code' }];

    const result = await client('login').current.startWithEmail(EMAIL, false);

    expect(signInState.emailCode.sendCode).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'next',
      step: { kind: 'code', email: EMAIL, purpose: 'sign_in' },
    });
  });

  it('offers sign-up when no account uses the email', async () => {
    signInState.create.mockResolvedValue({
      error: {
        code: 'api_response_error',
        errors: [{ code: 'form_identifier_not_found', meta: { paramName: 'identifier' } }],
      },
    });

    const result = await client('login').current.startWithEmail(EMAIL, false);

    expect(result).toEqual({
      status: 'failed',
      message: NO_ACCOUNT_FOR_EMAIL,
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

    const result = await client('signup').current.startWithEmail(EMAIL, true);

    expect(result).toEqual({
      status: 'failed',
      message: ACCOUNT_ALREADY_EXISTS,
      field: 'email',
      switchMode: true,
    });
  });

  it('refuses to create an account before the terms are accepted', async () => {
    const result = await client('signup').current.startWithEmail(EMAIL, false);

    expect(signUpState.create).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'failed', message: TERMS_NOT_ACCEPTED });
  });

  it('records terms acceptance on the account it creates', async () => {
    await client('signup').current.startWithEmail(EMAIL, true);

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
      step: { kind: 'code', email: EMAIL, purpose: 'reset' },
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
    const result = await client('login').current.startProvider('google', false);

    expect(signInState.sso).toHaveBeenCalledWith({
      strategy: 'oauth_google',
      redirectUrl: REDIRECTS.completeUrl,
      redirectCallbackUrl: REDIRECTS.ssoCallbackUrl,
    });
    expect(result).toEqual({ status: 'redirecting' });
  });

  it('will not start a provider sign-up before the terms are accepted', async () => {
    const result = await client('signup').current.startProvider('github', false);

    expect(signUpState.sso).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'failed', message: TERMS_NOT_ACCEPTED });
  });

  it('carries terms acceptance into a provider sign-up', async () => {
    await client('signup').current.startProvider('github', true);

    expect(signUpState.sso).toHaveBeenCalledWith({
      strategy: 'oauth_github',
      redirectUrl: REDIRECTS.completeUrl,
      redirectCallbackUrl: REDIRECTS.ssoCallbackUrl,
      legalAccepted: true,
    });
  });

  it('reports the provider message when a step fails', async () => {
    signInState.password.mockResolvedValue({
      error: {
        code: 'api_response_error',
        errors: [
          {
            code: 'form_password_incorrect',
            longMessage: 'That password is not correct.',
            meta: { paramName: 'password' },
          },
        ],
      },
    });

    const result = await client('login').current.submitPassword('wrong');

    expect(result).toEqual({
      status: 'failed',
      message: 'That password is not correct.',
      field: 'password',
    });
  });
});
