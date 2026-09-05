'use client';

import { useCallback, useEffect, useState } from 'react';

import { TERMS_GATE_STORAGE_KEY } from '@/app/signup/TermsGate';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { AuthCodeStep } from './AuthCodeStep';
import { AuthEmailStep } from './AuthEmailStep';
import { AuthNewPasswordStep } from './AuthNewPasswordStep';
import { AuthPasswordStep } from './AuthPasswordStep';
import { AuthSecondFactorStep } from './AuthSecondFactorStep';
import { IdentityBotProtection, useIdentityAuthClient } from './identityAuthAdapter';
import type {
  AuthMode,
  AuthProvider,
  AuthProviderId,
  AuthRedirects,
  AuthResult,
  AuthStep,
} from './authContract';

const INITIAL_STEP: AuthStep = { kind: 'email' };

function readTermsMarker(): boolean {
  try {
    return window.localStorage.getItem(TERMS_GATE_STORAGE_KEY) === POLICY_LAST_UPDATED.terms;
  } catch {
    return false;
  }
}

function writeTermsMarker(accepted: boolean): void {
  try {
    if (accepted) {
      window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
      return;
    }
    window.localStorage.removeItem(TERMS_GATE_STORAGE_KEY);
  } catch {
    return;
  }
}

export function AuthFlow({
  mode,
  providers,
  redirects,
}: {
  mode: AuthMode;
  providers: readonly AuthProvider[];
  redirects: AuthRedirects;
}) {
  const client = useIdentityAuthClient(mode, redirects);

  const [step, setStep] = useState<AuthStep>(INITIAL_STEP);
  const [busy, setBusy] = useState(false);
  const [providerPending, setProviderPending] = useState<AuthProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [switchOffered, setSwitchOffered] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    if (mode === 'signup') setTermsAccepted(readTermsMarker());
  }, [mode]);

  const clearMessages = useCallback(() => {
    setError(null);
    setFieldError(null);
    setSwitchOffered(false);
  }, []);

  const apply = useCallback((result: AuthResult) => {
    if (result.status === 'next') {
      setStep(result.step);
      return;
    }
    if (result.status === 'failed') {
      if (result.field) setFieldError(result.message);
      else setError(result.message);
      setSwitchOffered(result.switchMode === true);
    }
  }, []);

  const run = useCallback(
    async (action: () => Promise<AuthResult>) => {
      if (busy || !client.isReady) return;
      clearMessages();
      setBusy(true);
      try {
        apply(await action());
      } finally {
        setBusy(false);
      }
    },
    [apply, busy, clearMessages, client.isReady],
  );

  const onTermsChange = useCallback((accepted: boolean) => {
    setTermsAccepted(accepted);
    writeTermsMarker(accepted);
  }, []);

  const onEditEmail = useCallback(() => {
    clearMessages();
    setStep(INITIAL_STEP);
    void client.restart();
  }, [clearMessages, client]);

  const onStartProvider = useCallback(
    async (provider: AuthProviderId) => {
      if (providerPending !== null || !client.isReady) return;
      clearMessages();
      setProviderPending(provider);
      const result = await client.startProvider(provider, termsAccepted);
      if (result.status !== 'redirecting') {
        setProviderPending(null);
        apply(result);
      }
    },
    [apply, clearMessages, client, providerPending, termsAccepted],
  );

  const onSubmitCode = useCallback(
    (code: string) => {
      if (step.kind !== 'code') return;
      void run(() => client.submitCode(code, step.purpose));
    },
    [client, run, step],
  );

  const botProtection = mode === 'signup' ? <IdentityBotProtection /> : null;

  if (step.kind === 'password') {
    return (
      <AuthPasswordStep
        email={step.email}
        busy={busy}
        error={error}
        fieldError={fieldError}
        onSubmit={(password) => void run(() => client.submitPassword(password))}
        onEditEmail={onEditEmail}
        onForgotPassword={() => void run(() => client.startPasswordReset())}
        onUseCode={() => void run(() => client.startEmailCode())}
      />
    );
  }

  if (step.kind === 'code') {
    return (
      <AuthCodeStep
        email={step.email}
        busy={busy}
        error={error}
        fieldError={fieldError}
        onSubmit={onSubmitCode}
        onResend={() => void run(() => client.resendCode(step.purpose))}
        onEditEmail={onEditEmail}
      />
    );
  }

  if (step.kind === 'second_factor') {
    return (
      <AuthSecondFactorStep
        factor={step.factor}
        busy={busy}
        error={error}
        fieldError={fieldError}
        onSubmit={(code) => void run(() => client.submitSecondFactor(code, step.factor))}
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
        onSubmit={(password) => void run(() => client.submitNewPassword(password))}
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
        busy={busy}
        error={error}
        fieldError={fieldError}
        switchOffered={switchOffered}
        termsAccepted={termsAccepted}
        providerPending={providerPending}
        onTermsChange={onTermsChange}
        onSubmit={(email) => void run(() => client.startWithEmail(email, termsAccepted))}
        onStartProvider={(provider) => void onStartProvider(provider)}
      />
      {botProtection}
    </>
  );
}
