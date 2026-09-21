'use client';

import { useCallback, useRef, useState } from 'react';

import { TERMS_GATE_STORAGE_KEY } from '@/app/signup/TermsGate';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { isRetryableAuthError, type AuthErrorKind } from '@/lib/auth/error-taxonomy';
import { AuthCodeStep } from './AuthCodeStep';
import { AuthEmailStep } from './AuthEmailStep';
import { AuthNewPasswordStep } from './AuthNewPasswordStep';
import { AuthNoticeStep } from './AuthNoticeStep';
import { AuthPasswordStep } from './AuthPasswordStep';
import { AuthSecondFactorStep } from './AuthSecondFactorStep';
import { IdentityBotProtection, useIdentityAuthClient } from './identityAuthAdapter';
import { rememberAuthMethod } from './lastUsedMethod';
import type {
  AuthMethodId,
  AuthMode,
  AuthPhase,
  AuthProvider,
  AuthProviderId,
  AuthRedirects,
  AuthResult,
  AuthSecondFactor,
  AuthStep,
} from './authContract';

const INITIAL_STEP: AuthStep = { kind: 'email' };

function writeTermsMarker(): void {
  try {
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
  } catch {
    return;
  }
}

export function AuthFlow({
  mode,
  providers,
  passkeySignIn = false,
  mfaEmailFallback = false,
  redirects,
}: {
  mode: AuthMode;
  providers: readonly AuthProvider[];
  passkeySignIn?: boolean;
  mfaEmailFallback?: boolean;
  redirects: AuthRedirects;
}) {
  const client = useIdentityAuthClient(mode, redirects, { mfaEmailFallback });

  const [step, setStep] = useState<AuthStep>(INITIAL_STEP);
  const [phase, setPhase] = useState<AuthPhase>('idle');
  const [providerPending, setProviderPending] = useState<AuthProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AuthErrorKind | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [switchOffered, setSwitchOffered] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null);
  const lastAction = useRef<{ action: () => Promise<AuthResult>; phase: AuthPhase } | null>(null);

  const busy = phase !== 'idle';

  const clearMessages = useCallback(() => {
    setError(null);
    setErrorKind(null);
    setFieldError(null);
    setSwitchOffered(false);
    setRetryAfterSeconds(null);
  }, []);

  const apply = useCallback((result: AuthResult) => {
    if (result.status === 'next') {
      setStep(result.step);
      return;
    }
    if (result.status === 'failed') {
      setErrorKind(result.kind);
      setRetryAfterSeconds(result.retryAfterSeconds ?? null);
      if (result.field) setFieldError(result.message);
      else setError(result.message);
      setSwitchOffered(result.switchMode === true);
    }
  }, []);

  const run = useCallback(
    async (action: () => Promise<AuthResult>, nextPhase: AuthPhase) => {
      if (busy || !client.isReady) return;
      clearMessages();
      lastAction.current = { action, phase: nextPhase };
      setPhase(nextPhase);
      let handingOff = false;
      try {
        const result = await action();
        if (result.status === 'redirecting') {
          handingOff = true;
          setPhase(result.phase ?? 'redirecting');
        } else {
          apply(result);
        }
      } finally {
        if (!handingOff) setPhase('idle');
      }
    },
    [apply, busy, clearMessages, client.isReady],
  );

  const onRetry = useCallback(() => {
    const previous = lastAction.current;
    if (previous) void run(previous.action, previous.phase);
  }, [run]);

  const onEditEmail = useCallback(() => {
    clearMessages();
    setStep(INITIAL_STEP);
    lastAction.current = null;
    void client.restart();
  }, [clearMessages, client]);

  const onStartProvider = useCallback(
    async (provider: AuthProviderId) => {
      if (providerPending !== null || busy || !client.isReady) return;
      clearMessages();
      setProviderPending(provider);
      setPhase('redirecting');
      if (mode === 'signup') writeTermsMarker();
      const result = await client.startProvider(provider);
      if (result.status === 'redirecting') {
        rememberAuthMethod({ kind: 'provider', provider });
        return;
      }
      setProviderPending(null);
      setPhase('idle');
      apply(result);
    },
    [apply, busy, clearMessages, client, mode, providerPending],
  );

  const onStartPasskey = useCallback(() => {
    rememberAuthMethod({ kind: 'method', method: 'passkey' });
    void run(() => client.signInWithPasskey(), 'passkey_requested');
  }, [client, run]);

  const onChooseMethod = useCallback(
    (method: AuthMethodId) => {
      rememberAuthMethod({ kind: 'method', method });
      void run(
        () => client.startMethod(method),
        method === 'passkey' ? 'passkey_requested' : 'sending_code',
      );
    },
    [client, run],
  );

  const onUseFactor = useCallback(
    (factor: AuthSecondFactor) => {
      void run(() => client.switchSecondFactor(factor), 'sending_code');
    },
    [client, run],
  );

  const retryOffered = errorKind !== null && isRetryableAuthError(errorKind);
  const botProtection = mode === 'signup' ? <IdentityBotProtection /> : null;

  if (step.kind === 'notice') {
    return (
      <AuthNoticeStep
        notice={step.notice}
        retryAfterSeconds={step.retryAfterSeconds}
        onRestart={onEditEmail}
      />
    );
  }

  if (step.kind === 'password') {
    return (
      <AuthPasswordStep
        email={step.email}
        phase={phase}
        error={error}
        fieldError={fieldError}
        methods={step.methods.filter((method) => method !== 'password')}
        onSubmit={(password) => {
          rememberAuthMethod({ kind: 'method', method: 'password' });
          void run(() => client.submitPassword(password), 'verifying');
        }}
        onEditEmail={onEditEmail}
        onForgotPassword={() => void run(() => client.startPasswordReset(), 'sending_code')}
        onChooseMethod={onChooseMethod}
      />
    );
  }

  if (step.kind === 'code') {
    return (
      <AuthCodeStep
        email={step.email}
        phase={phase}
        error={error}
        fieldError={fieldError}
        resendBlockedSeconds={errorKind === 'rate_limited' ? retryAfterSeconds : null}
        methods={step.methods.filter((method) => method !== 'email_code')}
        onSubmit={(code) => void run(() => client.submitCode(code, step.purpose), 'verifying')}
        onResend={() => void run(() => client.resendCode(step.purpose), 'sending_code')}
        onEditEmail={onEditEmail}
        onChooseMethod={onChooseMethod}
      />
    );
  }

  if (step.kind === 'second_factor') {
    return (
      <AuthSecondFactorStep
        factor={step.factor}
        alternatives={step.alternatives}
        phase={phase}
        error={error}
        fieldError={fieldError}
        onSubmit={(code) =>
          void run(() => client.submitSecondFactor(code, step.factor), 'verifying')
        }
        onUseFactor={onUseFactor}
        onEditEmail={onEditEmail}
      />
    );
  }

  if (step.kind === 'new_password') {
    return (
      <AuthNewPasswordStep
        email={step.email}
        busy={busy}
        error={error}
        fieldError={fieldError}
        onSubmit={(password) => void run(() => client.submitNewPassword(password), 'verifying')}
      />
    );
  }

  return (
    <>
      <AuthEmailStep
        mode={mode}
        providers={providers}
        switchUrl={redirects.switchUrl}
        ready={client.isReady}
        phase={phase}
        error={error}
        fieldError={fieldError}
        switchOffered={switchOffered}
        retryOffered={retryOffered}
        providerPending={providerPending}
        onRetry={onRetry}
        onSubmit={(email) => {
          if (mode === 'signup') writeTermsMarker();
          void run(() => client.startWithEmail(email), 'checking_account');
        }}
        onStartProvider={(provider) => void onStartProvider(provider)}
        passkeySignIn={mode === 'login' && passkeySignIn}
        onStartPasskey={onStartPasskey}
      />
      {botProtection}
    </>
  );
}
