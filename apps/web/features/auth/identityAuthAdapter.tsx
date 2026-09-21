'use client';

import { AuthenticateWithRedirectCallback, useClerk, useSignIn, useSignUp } from '@clerk/nextjs';
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

import { classifyAuthError, isAuthNoticeKind, type AuthErrorKind } from '@/lib/auth/error-taxonomy';
import { useAuthCopy } from './authCopy';
import type {
  AuthClient,
  AuthCodePurpose,
  AuthMethodId,
  AuthMode,
  AuthProviderId,
  AuthRedirects,
  AuthResult,
  AuthSecondFactor,
  AuthSecondFactorKind,
} from './authContract';

const PROVIDER_STRATEGIES = {
  google: 'oauth_google',
  github: 'oauth_github',
  microsoft: 'oauth_microsoft',
  apple: 'oauth_apple',
} as const satisfies Readonly<Record<AuthProviderId, string>>;

const FIRST_FACTOR_METHODS: Readonly<Record<string, AuthMethodId>> = {
  password: 'password',
  email_code: 'email_code',
  passkey: 'passkey',
};

// An address an enterprise connection covers is the organization's to
// authenticate, so that connection outranks any personal factor on the account.
const ENTERPRISE_SSO_STRATEGY = 'enterprise_sso';

const SECOND_FACTOR_KINDS: Readonly<Record<string, AuthSecondFactorKind>> = {
  totp: 'authenticator',
  phone_code: 'text_message',
  email_code: 'email',
  backup_code: 'backup_code',
};

const SECOND_FACTOR_PRIORITY: readonly AuthSecondFactorKind[] = [
  'authenticator',
  'text_message',
  'email',
  'backup_code',
];

// Email is the weakest second factor because it usually shares a recovery path
// with the first factor, so it is offered only when the deployment allows it.
const POLICY_GATED_SECOND_FACTORS: readonly AuthSecondFactorKind[] = ['email'];

interface VendorFactor {
  strategy: string;
  safeIdentifier?: string;
}

export interface IdentityAuthOptions {
  mfaEmailFallback?: boolean;
}

export function useIdentityAuthClient(
  mode: AuthMode,
  redirects: AuthRedirects,
  options: IdentityAuthOptions = {},
): AuthClient {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const copy = useAuthCopy();

  const signInRef = useRef(signIn);
  signInRef.current = signIn;
  const signUpRef = useRef(signUp);
  signUpRef.current = signUp;
  const redirectsRef = useRef(redirects);
  redirectsRef.current = redirects;
  const mfaEmailFallback = options.mfaEmailFallback === true;
  const policyRef = useRef(mfaEmailFallback);
  policyRef.current = mfaEmailFallback;
  const copyRef = useRef(copy);
  copyRef.current = copy;

  const subscribeToStatus = useCallback(
    (onChange: () => void) => {
      clerk.on('status', onChange, { notify: true });
      return () => clerk.off('status', onChange);
    },
    [clerk],
  );
  const readReady = useCallback(() => Boolean(clerk.loaded), [clerk]);
  const isReady = useSyncExternalStore(subscribeToStatus, readReady, () => false);

  const secondFactorLabel = useCallback((kind: AuthSecondFactorKind): string => {
    const labels: Readonly<Record<AuthSecondFactorKind, string>> = {
      authenticator: copyRef.current.text('flow.factor.authenticator', 'Authenticator code'),
      text_message: copyRef.current.text('flow.factor.textMessage', 'Text message code'),
      email: copyRef.current.text('flow.factor.email', 'Emailed code'),
      backup_code: copyRef.current.text('flow.factor.backupCode', 'Backup code'),
    };
    return labels[kind];
  }, []);

  const toSecondFactor = useCallback(
    (candidate: VendorFactor): AuthSecondFactor | null => {
      const kind = SECOND_FACTOR_KINDS[candidate.strategy];
      if (!kind) return null;
      if (POLICY_GATED_SECOND_FACTORS.includes(kind) && !policyRef.current) return null;
      return { kind, label: secondFactorLabel(kind), hint: candidate.safeIdentifier ?? null };
    },
    [secondFactorLabel],
  );

  const orderedSecondFactors = useCallback(
    (candidates: readonly VendorFactor[]): readonly AuthSecondFactor[] => {
      const usable = candidates
        .map(toSecondFactor)
        .filter((factor): factor is AuthSecondFactor => factor !== null);
      return SECOND_FACTOR_PRIORITY.flatMap((kind) =>
        usable.filter((factor) => factor.kind === kind),
      );
    },
    [toSecondFactor],
  );

  const fail = useCallback(
    (
      error: unknown,
      overrides: { inline?: boolean; message?: string; switchMode?: boolean } = {},
    ): AuthResult => {
      const descriptor = classifyAuthError(error);
      if (!overrides.inline && isAuthNoticeKind(descriptor.kind)) {
        return {
          status: 'next',
          step: {
            kind: 'notice',
            notice: descriptor.kind,
            retryAfterSeconds: descriptor.retryAfterSeconds ?? null,
          },
        };
      }
      return {
        status: 'failed',
        kind: descriptor.kind,
        message:
          overrides.message ??
          descriptor.vendorMessage ??
          copyRef.current.errorCopy(descriptor.kind).message,
        ...(descriptor.field ? { field: descriptor.field } : {}),
        ...(descriptor.retryAfterSeconds
          ? { retryAfterSeconds: descriptor.retryAfterSeconds }
          : {}),
        ...(overrides.switchMode ? { switchMode: true } : {}),
      };
    },
    [],
  );

  const unexpected = useCallback(
    (kind: AuthErrorKind): AuthResult => ({
      status: 'failed',
      kind,
      message: copyRef.current.errorCopy(kind).message,
    }),
    [],
  );

  const firstFactors = useCallback(
    (): readonly VendorFactor[] =>
      (signInRef.current.supportedFirstFactors ?? []) as VendorFactor[],
    [],
  );

  const availableMethods = useCallback((): readonly AuthMethodId[] => {
    const found = new Set<AuthMethodId>();
    for (const factor of firstFactors()) {
      const method = FIRST_FACTOR_METHODS[factor.strategy];
      if (method) found.add(method);
    }
    return [...found];
  }, [firstFactors]);

  const startEnterpriseSso = useCallback(
    async (email: string): Promise<AuthResult> => {
      const { completeUrl, ssoCallbackUrl } = redirectsRef.current;
      const { error } = await signInRef.current.sso({
        identifier: email,
        strategy: ENTERPRISE_SSO_STRATEGY,
        redirectUrl: completeUrl,
        redirectCallbackUrl: ssoCallbackUrl,
      });
      return error ? fail(error) : { status: 'redirecting', phase: 'enterprise_redirecting' };
    },
    [fail],
  );

  const finalizeSignIn = useCallback(async (): Promise<AuthResult> => {
    const { error } = await signInRef.current.finalize({
      navigate: ({ decorateUrl }) => {
        window.location.assign(decorateUrl(redirectsRef.current.completeUrl));
      },
    });
    return error ? fail(error) : { status: 'complete' };
  }, [fail]);

  const finalizeSignUp = useCallback(async (): Promise<AuthResult> => {
    const { error } = await signUpRef.current.finalize({
      navigate: ({ decorateUrl }) => {
        window.location.assign(decorateUrl(redirectsRef.current.completeUrl));
      },
    });
    return error ? fail(error) : { status: 'complete' };
  }, [fail]);

  const sendSignInEmailCode = useCallback(
    async (email: string): Promise<AuthResult> => {
      const { error } = await signInRef.current.emailCode.sendCode();
      if (error) return fail(error);
      return {
        status: 'next',
        step: { kind: 'code', email, purpose: 'sign_in', methods: availableMethods() },
      };
    },
    [availableMethods, fail],
  );

  const prepareSecondFactor = useCallback(
    async (factor: AuthSecondFactor): Promise<AuthResult | null> => {
      const mfa = signInRef.current.mfa;
      if (factor.kind === 'text_message') {
        const { error } = await mfa.sendPhoneCode();
        return error ? fail(error) : null;
      }
      if (factor.kind === 'email') {
        const { error } = await mfa.sendEmailCode();
        return error ? fail(error) : null;
      }
      return null;
    },
    [fail],
  );

  const resolveSignInState = useCallback(
    async (email: string): Promise<AuthResult> => {
      const current = signInRef.current;

      if (current.status === 'complete') return finalizeSignIn();

      if (current.status === 'needs_new_password') {
        return { status: 'next', step: { kind: 'new_password', email } };
      }

      if (current.status === 'needs_second_factor') {
        const factors = orderedSecondFactors(current.supportedSecondFactors as VendorFactor[]);
        const factor = factors[0];
        if (!factor) return unexpected('unexpected');
        const sendFailure = await prepareSecondFactor(factor);
        if (sendFailure) return sendFailure;
        return {
          status: 'next',
          step: { kind: 'second_factor', factor, alternatives: factors.slice(1) },
        };
      }

      if (firstFactors().some((factor) => factor.strategy === ENTERPRISE_SSO_STRATEGY)) {
        return startEnterpriseSso(email);
      }

      const methods = availableMethods();
      if (methods.includes('password')) {
        return { status: 'next', step: { kind: 'password', email, methods } };
      }

      return sendSignInEmailCode(email);
    },
    [
      availableMethods,
      finalizeSignIn,
      firstFactors,
      orderedSecondFactors,
      prepareSecondFactor,
      sendSignInEmailCode,
      startEnterpriseSso,
      unexpected,
    ],
  );

  const resolveSignUpState = useCallback(
    async (email: string): Promise<AuthResult> => {
      const current = signUpRef.current;
      if (current.status === 'complete') return finalizeSignUp();
      const { error } = await current.verifications.sendEmailCode();
      if (error) return fail(error);
      return { status: 'next', step: { kind: 'code', email, purpose: 'sign_up', methods: [] } };
    },
    [fail, finalizeSignUp],
  );

  const startWithEmail = useCallback(
    async (email: string): Promise<AuthResult> => {
      if (mode === 'signup') {
        const { error } = await signUpRef.current.create({
          emailAddress: email,
          legalAccepted: true,
        });
        if (error) {
          const kind = classifyAuthError(error).kind;
          if (kind === 'identifier_exists') return fail(error, { switchMode: true });
          return fail(error);
        }
        return resolveSignUpState(email);
      }

      const { error } = await signInRef.current.create({ identifier: email });
      if (error) {
        const kind = classifyAuthError(error).kind;
        if (kind === 'identifier_not_found') return fail(error, { switchMode: true });
        return fail(error);
      }
      return resolveSignInState(email);
    },
    [fail, mode, resolveSignInState, resolveSignUpState],
  );

  const submitPassword = useCallback(
    async (password: string): Promise<AuthResult> => {
      const { error } = await signInRef.current.password({ password });
      if (error) return fail(error);
      return resolveSignInState(signInRef.current.identifier ?? '');
    },
    [fail, resolveSignInState],
  );

  const submitCode = useCallback(
    async (code: string, purpose: AuthCodePurpose): Promise<AuthResult> => {
      if (purpose === 'sign_up') {
        const { error } = await signUpRef.current.verifications.verifyEmailCode({ code });
        if (error) return fail(error);
        if (signUpRef.current.status === 'complete') return finalizeSignUp();
        return unexpected('unexpected');
      }

      const email = signInRef.current.identifier ?? '';
      if (purpose === 'reset') {
        const { error } = await signInRef.current.resetPasswordEmailCode.verifyCode({ code });
        if (error) return fail(error);
        return { status: 'next', step: { kind: 'new_password', email } };
      }

      const { error } = await signInRef.current.emailCode.verifyCode({ code });
      if (error) return fail(error);
      return resolveSignInState(email);
    },
    [fail, finalizeSignUp, resolveSignInState, unexpected],
  );

  const resendCode = useCallback(
    async (purpose: AuthCodePurpose): Promise<AuthResult> => {
      if (purpose === 'sign_up') {
        const { error } = await signUpRef.current.verifications.sendEmailCode();
        return error ? fail(error, { inline: true }) : { status: 'complete' };
      }
      if (purpose === 'reset') {
        const { error } = await signInRef.current.resetPasswordEmailCode.sendCode();
        return error ? fail(error, { inline: true }) : { status: 'complete' };
      }
      const { error } = await signInRef.current.emailCode.sendCode();
      return error ? fail(error, { inline: true }) : { status: 'complete' };
    },
    [fail],
  );

  const submitSecondFactor = useCallback(
    async (code: string, factor: AuthSecondFactor): Promise<AuthResult> => {
      const mfa = signInRef.current.mfa;
      const attempt =
        factor.kind === 'authenticator'
          ? mfa.verifyTOTP({ code })
          : factor.kind === 'text_message'
            ? mfa.verifyPhoneCode({ code })
            : factor.kind === 'email'
              ? mfa.verifyEmailCode({ code })
              : mfa.verifyBackupCode({ code });
      const { error } = await attempt;
      if (error) return fail(error);
      return resolveSignInState(signInRef.current.identifier ?? '');
    },
    [fail, resolveSignInState],
  );

  const switchSecondFactor = useCallback(
    async (factor: AuthSecondFactor): Promise<AuthResult> => {
      const sendFailure = await prepareSecondFactor(factor);
      if (sendFailure) return sendFailure;
      const others = orderedSecondFactors(
        signInRef.current.supportedSecondFactors as VendorFactor[],
      ).filter((candidate) => candidate.kind !== factor.kind);
      return { status: 'next', step: { kind: 'second_factor', factor, alternatives: others } };
    },
    [orderedSecondFactors, prepareSecondFactor],
  );

  const submitNewPassword = useCallback(
    async (password: string): Promise<AuthResult> => {
      const { error } = await signInRef.current.resetPasswordEmailCode.submitPassword({ password });
      if (error) return fail(error);
      return resolveSignInState(signInRef.current.identifier ?? '');
    },
    [fail, resolveSignInState],
  );

  const startPasswordReset = useCallback(async (): Promise<AuthResult> => {
    const email = signInRef.current.identifier ?? '';
    const { error } = await signInRef.current.resetPasswordEmailCode.sendCode();
    if (error) return fail(error);
    return {
      status: 'next',
      step: { kind: 'code', email, purpose: 'reset', methods: availableMethods() },
    };
  }, [availableMethods, fail]);

  const signInWithPasskey = useCallback(async (): Promise<AuthResult> => {
    const { error } = await signInRef.current.passkey({ flow: 'discoverable' });
    if (error) return fail(error);
    if (signInRef.current.status === 'complete') return finalizeSignIn();
    return resolveSignInState(signInRef.current.identifier ?? '');
  }, [fail, finalizeSignIn, resolveSignInState]);

  const startMethod = useCallback(
    async (method: AuthMethodId): Promise<AuthResult> => {
      const email = signInRef.current.identifier ?? '';
      if (method === 'passkey') return signInWithPasskey();
      if (method === 'email_code') return sendSignInEmailCode(email);
      return { status: 'next', step: { kind: 'password', email, methods: availableMethods() } };
    },
    [availableMethods, sendSignInEmailCode, signInWithPasskey],
  );

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
        return error ? fail(error) : { status: 'redirecting' };
      }

      const { error } = await signInRef.current.sso({
        strategy,
        redirectUrl: completeUrl,
        redirectCallbackUrl: ssoCallbackUrl,
      });
      return error ? fail(error) : { status: 'redirecting' };
    },
    [fail, mode],
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
      switchSecondFactor,
      submitNewPassword,
      startPasswordReset,
      startMethod,
      startProvider,
      signInWithPasskey,
      restart,
    }),
    [
      isReady,
      resendCode,
      restart,
      signInWithPasskey,
      startMethod,
      startPasswordReset,
      startProvider,
      startWithEmail,
      submitCode,
      submitNewPassword,
      submitPassword,
      submitSecondFactor,
      switchSecondFactor,
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
