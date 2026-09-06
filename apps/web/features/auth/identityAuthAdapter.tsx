'use client';

import { AuthenticateWithRedirectCallback, useClerk, useSignIn, useSignUp } from '@clerk/nextjs';
import { useCallback, useMemo, useRef } from 'react';

import {
  ACCOUNT_ALREADY_EXISTS,
  NO_ACCOUNT_FOR_EMAIL,
  UNEXPECTED_FAILURE,
  type AuthClient,
  type AuthCodePurpose,
  type AuthFieldName,
  type AuthMode,
  type AuthProviderId,
  type AuthRedirects,
  type AuthResult,
  type AuthSecondFactor,
  type AuthSecondFactorKind,
} from './authContract';

const PROVIDER_STRATEGIES = {
  google: 'oauth_google',
  github: 'oauth_github',
  microsoft: 'oauth_microsoft',
  apple: 'oauth_apple',
} as const satisfies Readonly<Record<AuthProviderId, string>>;

const IDENTIFIER_NOT_FOUND_CODES = ['form_identifier_not_found', 'form_param_nil'];
const IDENTIFIER_EXISTS_CODES = ['form_identifier_exists'];

const SECOND_FACTOR_KINDS: Readonly<Record<string, AuthSecondFactorKind>> = {
  totp: 'authenticator',
  phone_code: 'text_message',
  backup_code: 'backup_code',
};

const SECOND_FACTOR_LABELS: Readonly<Record<AuthSecondFactorKind, string>> = {
  authenticator: 'Authenticator code',
  text_message: 'Text message code',
  backup_code: 'Backup code',
};

const SECOND_FACTOR_PRIORITY: readonly AuthSecondFactorKind[] = [
  'authenticator',
  'text_message',
  'backup_code',
];

const FIELD_BY_ERROR_KEY: Readonly<Record<string, AuthFieldName>> = {
  identifier: 'email',
  emailAddress: 'email',
  password: 'password',
  code: 'code',
};

interface VendorError {
  code?: string;
  message?: string;
  longMessage?: string;
  meta?: { paramName?: string };
  errors?: VendorError[];
}

interface VendorSecondFactor {
  strategy: string;
  safeIdentifier?: string;
}

function readError(error: unknown): VendorError | null {
  if (!error || typeof error !== 'object') return null;
  const envelope = error as VendorError;
  return envelope.errors?.[0] ?? envelope;
}

function describe(error: unknown): string {
  const vendor = readError(error);
  const message = vendor?.longMessage ?? vendor?.message;
  return message && message.trim().length > 0 ? message.trim() : UNEXPECTED_FAILURE;
}

function fieldOf(error: unknown): AuthFieldName | undefined {
  const vendor = readError(error);
  const param = vendor?.meta?.paramName;
  return param ? FIELD_BY_ERROR_KEY[param] : undefined;
}

function hasCode(error: unknown, codes: readonly string[]): boolean {
  const vendor = readError(error);
  return vendor?.code ? codes.includes(vendor.code) : false;
}

function failure(error: unknown): AuthResult {
  const field = fieldOf(error);
  return { status: 'failed', message: describe(error), ...(field ? { field } : {}) };
}

function toSecondFactor(candidate: VendorSecondFactor): AuthSecondFactor | null {
  const kind = SECOND_FACTOR_KINDS[candidate.strategy];
  if (!kind) return null;
  return {
    kind,
    label: SECOND_FACTOR_LABELS[kind],
    hint: candidate.safeIdentifier ?? null,
  };
}

function pickSecondFactor(candidates: readonly VendorSecondFactor[]): AuthSecondFactor | null {
  const usable = candidates
    .map(toSecondFactor)
    .filter((factor): factor is AuthSecondFactor => factor !== null);
  for (const kind of SECOND_FACTOR_PRIORITY) {
    const match = usable.find((factor) => factor.kind === kind);
    if (match) return match;
  }
  return null;
}

export function useIdentityAuthClient(mode: AuthMode, redirects: AuthRedirects): AuthClient {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  const signInRef = useRef(signIn);
  signInRef.current = signIn;
  const signUpRef = useRef(signUp);
  signUpRef.current = signUp;
  const redirectsRef = useRef(redirects);
  redirectsRef.current = redirects;

  const isReady = Boolean((clerk as { loaded?: boolean }).loaded);

  const finalizeSignIn = useCallback(async (): Promise<AuthResult> => {
    const { error } = await signInRef.current.finalize({
      navigate: ({ decorateUrl }) => {
        window.location.assign(decorateUrl(redirectsRef.current.completeUrl));
      },
    });
    return error ? failure(error) : { status: 'complete' };
  }, []);

  const finalizeSignUp = useCallback(async (): Promise<AuthResult> => {
    const { error } = await signUpRef.current.finalize({
      navigate: ({ decorateUrl }) => {
        window.location.assign(decorateUrl(redirectsRef.current.completeUrl));
      },
    });
    return error ? failure(error) : { status: 'complete' };
  }, []);

  const sendSignInEmailCode = useCallback(async (email: string): Promise<AuthResult> => {
    const { error } = await signInRef.current.emailCode.sendCode();
    if (error) return failure(error);
    return { status: 'next', step: { kind: 'code', email, purpose: 'sign_in' } };
  }, []);

  const resolveSignInState = useCallback(
    async (email: string): Promise<AuthResult> => {
      const current = signInRef.current;

      if (current.status === 'complete') return finalizeSignIn();

      if (current.status === 'needs_new_password') {
        return { status: 'next', step: { kind: 'new_password', email } };
      }

      if (current.status === 'needs_second_factor') {
        const factor = pickSecondFactor(current.supportedSecondFactors as VendorSecondFactor[]);
        if (!factor) {
          return {
            status: 'failed',
            message: 'This account needs a verification step we cannot show here yet.',
          };
        }
        if (factor.kind === 'text_message') {
          const { error } = await current.mfa.sendPhoneCode();
          if (error) return failure(error);
        }
        return { status: 'next', step: { kind: 'second_factor', factor } };
      }

      const supportsPassword = (current.supportedFirstFactors as VendorSecondFactor[]).some(
        (factor) => factor.strategy === 'password',
      );
      if (supportsPassword) return { status: 'next', step: { kind: 'password', email } };

      return sendSignInEmailCode(email);
    },
    [finalizeSignIn, sendSignInEmailCode],
  );

  const resolveSignUpState = useCallback(
    async (email: string): Promise<AuthResult> => {
      const current = signUpRef.current;
      if (current.status === 'complete') return finalizeSignUp();
      const { error } = await current.verifications.sendEmailCode();
      if (error) return failure(error);
      return { status: 'next', step: { kind: 'code', email, purpose: 'sign_up' } };
    },
    [finalizeSignUp],
  );

  const startWithEmail = useCallback(
    async (email: string): Promise<AuthResult> => {
      if (mode === 'signup') {
        const { error } = await signUpRef.current.create({
          emailAddress: email,
          legalAccepted: true,
        });
        if (error) {
          if (hasCode(error, IDENTIFIER_EXISTS_CODES)) {
            return {
              status: 'failed',
              message: ACCOUNT_ALREADY_EXISTS,
              field: 'email',
              switchMode: true,
            };
          }
          return failure(error);
        }
        return resolveSignUpState(email);
      }

      const { error } = await signInRef.current.create({ identifier: email });
      if (error) {
        if (hasCode(error, IDENTIFIER_NOT_FOUND_CODES)) {
          return {
            status: 'failed',
            message: NO_ACCOUNT_FOR_EMAIL,
            field: 'email',
            switchMode: true,
          };
        }
        return failure(error);
      }
      return resolveSignInState(email);
    },
    [mode, resolveSignInState, resolveSignUpState],
  );

  const submitPassword = useCallback(
    async (password: string): Promise<AuthResult> => {
      const { error } = await signInRef.current.password({ password });
      if (error) return failure(error);
      return resolveSignInState(signInRef.current.identifier ?? '');
    },
    [resolveSignInState],
  );

  const submitCode = useCallback(
    async (code: string, purpose: AuthCodePurpose): Promise<AuthResult> => {
      if (purpose === 'sign_up') {
        const { error } = await signUpRef.current.verifications.verifyEmailCode({ code });
        if (error) return failure(error);
        if (signUpRef.current.status === 'complete') return finalizeSignUp();
        return {
          status: 'failed',
          message: 'This account needs more details than we can collect here yet.',
        };
      }

      const email = signInRef.current.identifier ?? '';
      if (purpose === 'reset') {
        const { error } = await signInRef.current.resetPasswordEmailCode.verifyCode({ code });
        if (error) return failure(error);
        return { status: 'next', step: { kind: 'new_password', email } };
      }

      const { error } = await signInRef.current.emailCode.verifyCode({ code });
      if (error) return failure(error);
      return resolveSignInState(email);
    },
    [finalizeSignUp, resolveSignInState],
  );

  const resendCode = useCallback(async (purpose: AuthCodePurpose): Promise<AuthResult> => {
    if (purpose === 'sign_up') {
      const { error } = await signUpRef.current.verifications.sendEmailCode();
      return error ? failure(error) : { status: 'complete' };
    }
    if (purpose === 'reset') {
      const { error } = await signInRef.current.resetPasswordEmailCode.sendCode();
      return error ? failure(error) : { status: 'complete' };
    }
    const { error } = await signInRef.current.emailCode.sendCode();
    return error ? failure(error) : { status: 'complete' };
  }, []);

  const submitSecondFactor = useCallback(
    async (code: string, factor: AuthSecondFactor): Promise<AuthResult> => {
      const mfa = signInRef.current.mfa;
      const attempt =
        factor.kind === 'authenticator'
          ? mfa.verifyTOTP({ code })
          : factor.kind === 'text_message'
            ? mfa.verifyPhoneCode({ code })
            : mfa.verifyBackupCode({ code });
      const { error } = await attempt;
      if (error) return failure(error);
      return resolveSignInState(signInRef.current.identifier ?? '');
    },
    [resolveSignInState],
  );

  const submitNewPassword = useCallback(
    async (password: string): Promise<AuthResult> => {
      const { error } = await signInRef.current.resetPasswordEmailCode.submitPassword({ password });
      if (error) return failure(error);
      return resolveSignInState(signInRef.current.identifier ?? '');
    },
    [resolveSignInState],
  );

  const startPasswordReset = useCallback(async (): Promise<AuthResult> => {
    const email = signInRef.current.identifier ?? '';
    const { error } = await signInRef.current.resetPasswordEmailCode.sendCode();
    if (error) return failure(error);
    return { status: 'next', step: { kind: 'code', email, purpose: 'reset' } };
  }, []);

  const startEmailCode = useCallback(async (): Promise<AuthResult> => {
    return sendSignInEmailCode(signInRef.current.identifier ?? '');
  }, [sendSignInEmailCode]);

  const startProvider = useCallback(
    async (provider: AuthProviderId): Promise<AuthResult> => {
      const strategy = PROVIDER_STRATEGIES[provider];
      const { completeUrl, ssoCallbackUrl } = redirectsRef.current;

      if (mode === 'signup') {
        const { error } = await signUpRef.current.sso({
          strategy,
          redirectUrl: completeUrl,
          redirectCallbackUrl: ssoCallbackUrl,
          legalAccepted: true,
        });
        return error ? failure(error) : { status: 'redirecting' };
      }

      const { error } = await signInRef.current.sso({
        strategy,
        redirectUrl: completeUrl,
        redirectCallbackUrl: ssoCallbackUrl,
      });
      return error ? failure(error) : { status: 'redirecting' };
    },
    [mode],
  );

  const restart = useCallback(async (): Promise<void> => {
    await (mode === 'signup' ? signUpRef.current.reset() : signInRef.current.reset());
  }, [mode]);

  return useMemo(
    () => ({
      isReady,
      startWithEmail,
      submitPassword,
      submitCode,
      resendCode,
      submitSecondFactor,
      submitNewPassword,
      startPasswordReset,
      startEmailCode,
      startProvider,
      restart,
    }),
    [
      isReady,
      resendCode,
      restart,
      startEmailCode,
      startPasswordReset,
      startProvider,
      startWithEmail,
      submitCode,
      submitNewPassword,
      submitPassword,
      submitSecondFactor,
    ],
  );
}

const CAPTCHA_ELEMENT_ID = 'clerk-captcha';

export function IdentityBotProtection() {
  return <div id={CAPTCHA_ELEMENT_ID} />;
}

export function IdentitySsoCallback({
  loginUrl,
  signupUrl,
  loginCompleteUrl,
  signUpCompleteUrl,
}: {
  loginUrl: string;
  signupUrl: string;
  loginCompleteUrl: string;
  signUpCompleteUrl: string;
}) {
  return (
    <AuthenticateWithRedirectCallback
      signInUrl={loginUrl}
      signUpUrl={signupUrl}
      signInForceRedirectUrl={loginCompleteUrl}
      signUpForceRedirectUrl={signUpCompleteUrl}
    />
  );
}
