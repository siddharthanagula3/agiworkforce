'use client';

import { AuthenticateWithRedirectCallback, useClerk, useSignIn, useSignUp } from '@clerk/nextjs';
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

import { getHostBridge, hostSupportsBrowserSignIn } from '@agiworkforce/local-runtime-contract';
import {
  beginBrowserSignIn,
  BROWSER_SIGN_IN_NEEDS_UPDATE,
  cancelBrowserSignIn,
} from '@/features/desktop-host/lib/browser-sign-in';
import {
  classifyAuthError,
  isAuthNoticeKind,
  readVendorAuthError,
  type AuthErrorKind,
} from '@/lib/auth/error-taxonomy';
import { useAuthCopy } from './authCopy';
import type {
  AuthClient,
  AuthCodePurpose,
  AuthMethodId,
  AuthPasswordPurpose,
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
// with the first factor, so it is offered beside a stronger one only when the
// deployment allows it.
const POLICY_GATED_SECOND_FACTORS: readonly AuthSecondFactorKind[] = ['email'];

const SIGN_UP_PASSWORD_FIELD = 'password';
const VERIFIED_STATUS = 'verified';
const FIRST_FACTOR_PASSED_STATUSES: readonly string[] = [
  'needs_second_factor',
  'needs_client_trust',
  'complete',
];

const EMAIL_CODE_STRATEGY = 'email_code';

// The provider allows one session per browser and refuses every attempt made
// while one is active, whichever address was typed.
const SESSION_EXISTS_CODE = 'session_exists';

const STAY_ON_PAGE = (): void => undefined;

const NO_ACCOUNT_CODE = 'form_identifier_not_found';
const ACCOUNT_EXISTS_CODE = 'form_identifier_exists';
const TRANSFERABLE_STATUS = 'transferable';
const PROVIDER_STRATEGY_PREFIX = 'oauth_';

type IdentityAttempt = 'sign_in' | 'sign_up';

interface VendorFactor {
  strategy: string;
  safeIdentifier?: string;
}

interface VendorVerification {
  status?: string | null;
  strategy?: string | null;
  error?: unknown;
}

export interface IdentityAuthOptions {
  mfaEmailFallback?: boolean;
  onSignUpStarted?: () => void;
}

function vendorCode(error: unknown): string | undefined {
  return readVendorAuthError(error)?.code;
}

// A provider return that failed leaves its error on the verification it ran;
// a transferable one is the callback's to finish, not a failure.
function unresolvedError(verification: VendorVerification | null | undefined): unknown {
  if (!verification?.strategy?.startsWith(PROVIDER_STRATEGY_PREFIX)) return null;
  if (!verification.error || verification.status === TRANSFERABLE_STATUS) return null;
  return verification.error;
}

export function useIdentityAuthClient(
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
  const onSignUpStartedRef = useRef(options.onSignUpStarted);
  onSignUpStartedRef.current = options.onSignUpStarted;
  const attemptRef = useRef<IdentityAttempt>('sign_in');

  const completeUrl = useCallback(
    (): string =>
      attemptRef.current === 'sign_up'
        ? redirectsRef.current.signUpCompleteUrl
        : redirectsRef.current.signInCompleteUrl,
    [],
  );

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
    (error: unknown, overrides: { inline?: boolean; message?: string } = {}): AuthResult => {
      if (readVendorAuthError(error)?.code === SESSION_EXISTS_CODE) {
        window.location.assign(completeUrl());
        return { status: 'redirecting' };
      }
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
      };
    },
    [completeUrl],
  );

  const unexpected = useCallback(
    (kind: AuthErrorKind): AuthResult => ({
      status: 'failed',
      kind,
      message: copyRef.current.errorCopy(kind).message,
    }),
    [],
  );

  const missingRequirement = useCallback(
    (fields: readonly string[]): AuthResult => ({
      status: 'failed',
      kind: 'unexpected',
      message: copyRef.current.text(
        'flow.signUp.missingFields',
        'This sign-up also needs {{fields}}, which this page cannot collect. Contact support to finish creating your account.',
        { fields: fields.map((field) => field.replaceAll('_', ' ')).join(', ') },
      ),
    }),
    [],
  );

  const unconfirmedAddress = useCallback(
    (error: unknown, email: string): AuthResult =>
      fail(error, {
        message: copyRef.current.text(
          'flow.signUp.unconfirmedAddress',
          'Your account for {{email}} was created, but we could not confirm the address, so we did not sign you in. Contact support to finish setting it up.',
          { email },
        ),
      }),
    [fail],
  );

  const unsentAddressCode = useCallback(
    (error: unknown, email: string): AuthResult =>
      fail(error, {
        message: copyRef.current.text(
          'flow.signUp.unsentAddressCode',
          'Your account for {{email}} was created, but we could not send the code that confirms the address, so we did not sign you in. Contact support to finish setting it up.',
          { email },
        ),
      }),
    [fail],
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
      if (getHostBridge()?.shell === 'electron') {
        if (!hostSupportsBrowserSignIn(getHostBridge())) {
          return { status: 'failed', kind: 'unexpected', message: BROWSER_SIGN_IN_NEEDS_UPDATE };
        }
        return (await beginBrowserSignIn())
          ? { status: 'redirecting', phase: 'enterprise_browser' }
          : unexpected('unexpected');
      }
      const { signInCompleteUrl, ssoCallbackUrl } = redirectsRef.current;
      const { error } = await signInRef.current.sso({
        identifier: email,
        strategy: ENTERPRISE_SSO_STRATEGY,
        redirectUrl: signInCompleteUrl,
        redirectCallbackUrl: ssoCallbackUrl,
      });
      return error ? fail(error) : { status: 'redirecting', phase: 'enterprise_redirecting' };
    },
    [fail, unexpected],
  );

  const finalizeSignIn = useCallback(async (): Promise<AuthResult> => {
    const { error } = await signInRef.current.finalize({
      navigate: ({ decorateUrl }) => {
        window.location.assign(decorateUrl(completeUrl()));
      },
    });
    return error ? fail(error) : { status: 'complete' };
  }, [completeUrl, fail]);

  const finalizeSignUp = useCallback(async (): Promise<AuthResult> => {
    const { error } = await signUpRef.current.finalize({
      navigate: ({ decorateUrl }) => {
        window.location.assign(decorateUrl(completeUrl()));
      },
    });
    return error ? fail(error) : { status: 'complete' };
  }, [completeUrl, fail]);

  const sendSignInEmailCode = useCallback(
    async (
      email: string,
      onFailure: (error: unknown) => AuthResult = fail,
    ): Promise<AuthResult> => {
      const { error } = await signInRef.current.emailCode.sendCode();
      if (error) return onFailure(error);
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

  const verifyDevice = useCallback(
    async (email: string): Promise<AuthResult> => {
      const { error } = await signInRef.current.mfa.sendEmailCode();
      if (error) return fail(error);
      return { status: 'next', step: { kind: 'code', email, purpose: 'device', methods: [] } };
    },
    [fail],
  );

  const resolveSignInState = useCallback(
    async (email: string): Promise<AuthResult> => {
      const current = signInRef.current;

      if (current.status === 'complete') return finalizeSignIn();

      if (current.status === 'needs_new_password') {
        return { status: 'next', step: { kind: 'new_password', email, purpose: 'reset' } };
      }

      if (current.status === 'needs_second_factor' || current.status === 'needs_client_trust') {
        const offered = current.supportedSecondFactors as VendorFactor[];
        const factors = orderedSecondFactors(offered);
        const emailFactor = offered.find((factor) => factor.strategy === EMAIL_CODE_STRATEGY);
        if (emailFactor && factors.every((factor) => factor.kind === 'email')) {
          return verifyDevice(emailFactor.safeIdentifier ?? email);
        }
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
      verifyDevice,
    ],
  );

  const proveAddressBySignIn = useCallback(
    async (email: string, unprovenSessionId: string | null): Promise<AuthResult> => {
      const unproven = clerk.client?.sessions.find((session) => session.id === unprovenSessionId);
      // A session the client no longer lists cannot be removed by id, and
      // leaving it would sign in an address nobody has proven.
      try {
        if (unproven) await unproven.remove();
        else if (unprovenSessionId !== null) await clerk.signOut(STAY_ON_PAGE);
      } catch (error) {
        if (unproven) await clerk.signOut(STAY_ON_PAGE);
        return unconfirmedAddress(error, email);
      }
      const { error } = await signInRef.current.create({ identifier: email });
      if (error) return unconfirmedAddress(error, email);
      return sendSignInEmailCode(email, (sendError) => unsentAddressCode(sendError, email));
    },
    [clerk, sendSignInEmailCode, unconfirmedAddress, unsentAddressCode],
  );

  const resolveSignUpState = useCallback(
    async (email: string): Promise<AuthResult> => {
      const current = signUpRef.current;
      const addressProven = current.verifications.emailAddress.status === VERIFIED_STATUS;
      if (current.status === 'complete') {
        return addressProven
          ? finalizeSignUp()
          : proveAddressBySignIn(email, current.createdSessionId);
      }

      const uncollectable = current.missingFields.filter(
        (field) => field !== SIGN_UP_PASSWORD_FIELD,
      );
      if (uncollectable.length > 0) return missingRequirement(uncollectable);

      if (!addressProven) {
        const { error } = await current.verifications.sendEmailCode();
        if (error) return fail(error);
        return { status: 'next', step: { kind: 'code', email, purpose: 'sign_up', methods: [] } };
      }

      if (current.missingFields.includes(SIGN_UP_PASSWORD_FIELD)) {
        return { status: 'next', step: { kind: 'new_password', email, purpose: 'sign_up' } };
      }

      return unexpected('unexpected');
    },
    [fail, finalizeSignUp, missingRequirement, proveAddressBySignIn, unexpected],
  );

  const beginSignIn = useCallback(async (email: string): Promise<{ error: unknown }> => {
    attemptRef.current = 'sign_in';
    return signInRef.current.create({ identifier: email });
  }, []);

  const startWithEmail = useCallback(
    async (email: string): Promise<AuthResult> => {
      const signingIn = await beginSignIn(email);
      if (!signingIn.error) return resolveSignInState(email);
      if (email.trim().length === 0 || vendorCode(signingIn.error) !== NO_ACCOUNT_CODE) {
        return fail(signingIn.error);
      }

      attemptRef.current = 'sign_up';
      const { error } = await signUpRef.current.create({
        emailAddress: email,
        legalAccepted: true,
      });
      if (!error) {
        onSignUpStartedRef.current?.();
        return resolveSignUpState(email);
      }
      if (vendorCode(error) !== ACCOUNT_EXISTS_CODE) return fail(error);

      // An account created between the two calls is signed in, once.
      const retried = await beginSignIn(email);
      return retried.error ? fail(retried.error) : resolveSignInState(email);
    },
    [beginSignIn, fail, resolveSignInState, resolveSignUpState],
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
        const signUp = signUpRef.current;
        if (signUp.verifications.emailAddress.status !== VERIFIED_STATUS) {
          const { error } = await signUp.verifications.verifyEmailCode({ code });
          if (error) return fail(error);
        }
        return resolveSignUpState(signUpRef.current.emailAddress ?? '');
      }

      const signIn = signInRef.current;
      const email = signIn.identifier ?? '';
      if (purpose === 'reset') {
        const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code });
        if (error) return fail(error);
        return { status: 'next', step: { kind: 'new_password', email, purpose: 'reset' } };
      }

      if (purpose === 'device') {
        if (signIn.status !== 'complete') {
          const { error } = await signIn.mfa.verifyEmailCode({ code });
          if (error) return fail(error);
        }
        return resolveSignInState(email);
      }

      if (!FIRST_FACTOR_PASSED_STATUSES.includes(signIn.status)) {
        const { error } = await signIn.emailCode.verifyCode({ code });
        if (error) return fail(error);
      }
      return resolveSignInState(email);
    },
    [fail, resolveSignInState, resolveSignUpState],
  );

  const resendCode = useCallback(
    async (purpose: AuthCodePurpose): Promise<AuthResult> => {
      if (purpose === 'sign_up') {
        const { error } = await signUpRef.current.verifications.sendEmailCode();
        return error ? fail(error, { inline: true }) : { status: 'sent' };
      }
      if (purpose === 'reset') {
        const { error } = await signInRef.current.resetPasswordEmailCode.sendCode();
        return error ? fail(error, { inline: true }) : { status: 'sent' };
      }
      if (purpose === 'device') {
        const { error } = await signInRef.current.mfa.sendEmailCode();
        return error ? fail(error, { inline: true }) : { status: 'sent' };
      }
      const { error } = await signInRef.current.emailCode.sendCode();
      return error ? fail(error, { inline: true }) : { status: 'sent' };
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
    async (password: string, purpose: AuthPasswordPurpose): Promise<AuthResult> => {
      if (purpose === 'sign_up') {
        const signUp = signUpRef.current;
        if (signUp.verifications.emailAddress.status !== VERIFIED_STATUS) {
          return resolveSignUpState(signUp.emailAddress ?? '');
        }
        const { error } = await signUp.password({ password });
        if (error) return fail(error);
        return resolveSignUpState(signUpRef.current.emailAddress ?? '');
      }
      const { error } = await signInRef.current.resetPasswordEmailCode.submitPassword({ password });
      if (error) return fail(error);
      return resolveSignInState(signInRef.current.identifier ?? '');
    },
    [fail, resolveSignInState, resolveSignUpState],
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
    attemptRef.current = 'sign_in';
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
      if (getHostBridge()?.shell === 'electron') {
        if (!hostSupportsBrowserSignIn(getHostBridge())) {
          return { status: 'failed', kind: 'unexpected', message: BROWSER_SIGN_IN_NEEDS_UPDATE };
        }
        return (await beginBrowserSignIn())
          ? { status: 'redirecting', phase: 'browser' }
          : unexpected('unexpected');
      }
      attemptRef.current = 'sign_in';
      const { signInCompleteUrl, ssoCallbackUrl } = redirectsRef.current;
      // The callback turns a provider account nobody has signed up with into a
      // sign-up, which finishes on the sign-up completion page.
      const { error } = await signInRef.current.sso({
        strategy: PROVIDER_STRATEGIES[provider],
        redirectUrl: signInCompleteUrl,
        redirectCallbackUrl: ssoCallbackUrl,
      });
      return error ? fail(error) : { status: 'redirecting' };
    },
    [fail, unexpected],
  );

  const readProviderReturn = useCallback((): AuthResult | null => {
    const error =
      unresolvedError(signInRef.current.firstFactorVerification) ??
      unresolvedError(signUpRef.current.verifications.externalAccount);
    return error ? fail(error, { inline: true }) : null;
  }, [fail]);

  const restart = useCallback(async (): Promise<void> => {
    if (hostSupportsBrowserSignIn(getHostBridge()) && !(await cancelBrowserSignIn())) return;
    attemptRef.current = 'sign_in';
    await Promise.all([signInRef.current.reset(), signUpRef.current.reset()]);
  }, []);

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
      readProviderReturn,
      restart,
    }),
    [
      isReady,
      readProviderReturn,
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

export interface IdentityTicketSignIn {
  ready: boolean;
  signInWithTicket: (ticket: string, completeUrl: string) => Promise<string | null>;
}

export function useIdentityTicketSignIn(): IdentityTicketSignIn {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const copy = useAuthCopy();
  const signInRef = useRef(signIn);
  signInRef.current = signIn;
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
  const ready = useSyncExternalStore(subscribeToStatus, readReady, () => false);

  const signInWithTicket = useCallback(
    async (ticket: string, completeUrl: string): Promise<string | null> => {
      const describe = (error: unknown): string => {
        const descriptor = classifyAuthError(error);
        return descriptor.vendorMessage ?? copyRef.current.errorCopy(descriptor.kind).message;
      };
      const started = await signInRef.current.ticket({ ticket });
      if (started.error) return describe(started.error);
      const finished = await signInRef.current.finalize({
        navigate: ({ decorateUrl }) => {
          window.location.assign(decorateUrl(completeUrl));
        },
      });
      return finished.error ? describe(finished.error) : null;
    },
    [],
  );

  return useMemo(() => ({ ready, signInWithTicket }), [ready, signInWithTicket]);
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
