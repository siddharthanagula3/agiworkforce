'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LifecycleStatus } from '@agiworkforce/types';

import { useAuthSceneBridge } from '@agiworkforce/ui/auth-scene';

import {
  clearSignupAttemptMarkers,
  writeSignupAttemptMarkers,
  type SignupAttemptChoices,
} from '@/app/signup/signupAttemptMarkers';
import {
  classifyAuthError,
  isRetryableAuthError,
  type AuthErrorKind,
} from '@/lib/auth/error-taxonomy';
import { AuthCodeStep } from './AuthCodeStep';
import { AuthEmailStep } from './AuthEmailStep';
import { AuthNewPasswordStep } from './AuthNewPasswordStep';
import { AuthNoticeStep } from './AuthNoticeStep';
import { AuthPasswordStep } from './AuthPasswordStep';
import { AuthSecondFactorStep } from './AuthSecondFactorStep';
import { IdentityBotProtection, useIdentityAuthClient } from './identityAuthAdapter';
import { useAuthCopy } from './authCopy';
import { rememberAuthMethod } from './lastUsedMethod';
import type {
  AuthFieldName,
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
const RESTING_PHASE = 'idle' satisfies Extract<LifecycleStatus, 'idle'> & AuthPhase;

function providerCheckedThePassword(result: AuthResult): boolean {
  if (result.status === 'complete') return true;
  if (result.status === 'failed') return result.field === 'password';
  if (result.status !== 'next') return false;
  const { step } = result;
  return (
    step.kind === 'second_factor' ||
    step.kind === 'new_password' ||
    (step.kind === 'code' && step.purpose === 'device')
  );
}

const NO_OPTIONAL_CHOICES: SignupAttemptChoices = { marketingEmail: false };

export function AuthFlow({
  mode,
  providers,
  passkeySignIn = false,
  mfaEmailFallback = false,
  optedOutBySignal = false,
  redirects,
}: {
  mode: AuthMode;
  providers: readonly AuthProvider[];
  passkeySignIn?: boolean;
  mfaEmailFallback?: boolean;
  optedOutBySignal?: boolean;
  redirects: AuthRedirects;
}) {
  const client = useIdentityAuthClient(mode, redirects, { mfaEmailFallback });
  const copy = useAuthCopy();
  const scene = useAuthSceneBridge();

  const [step, setStep] = useState<AuthStep>(INITIAL_STEP);
  const [phase, setPhase] = useState<AuthPhase>(RESTING_PHASE);
  const [providerPending, setProviderPending] = useState<AuthProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AuthErrorKind | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [erroredField, setErroredField] = useState<AuthFieldName | null>(null);
  const [switchOffered, setSwitchOffered] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null);
  const lastAction = useRef<{ action: () => Promise<AuthResult>; phase: AuthPhase } | null>(null);
  const inFlight = useRef(false);
  const admittedChoices = useRef(NO_OPTIONAL_CHOICES);

  const busy = phase !== RESTING_PHASE;

  useEffect(() => {
    if (error !== null || fieldError !== null || step.kind === 'notice') scene.setMood('error');
    else if (busy || providerPending !== null) scene.setMood('pending');
    else scene.setMood('neutral');
  }, [busy, error, fieldError, providerPending, scene, step.kind]);

  const clearMessages = useCallback(() => {
    setError(null);
    setErrorKind(null);
    setFieldError(null);
    setErroredField(null);
    setSwitchOffered(false);
    setRetryAfterSeconds(null);
  }, []);

  const apply = useCallback((result: AuthResult) => {
    if (result.status === 'next') {
      lastAction.current = null;
      setStep(result.step);
      return;
    }
    if (result.status === 'failed') {
      setErrorKind(result.kind);
      setRetryAfterSeconds(result.retryAfterSeconds ?? null);
      setErroredField(result.field ?? null);
      if (result.field) setFieldError(result.message);
      else setError(result.message);
      setSwitchOffered(result.switchMode === true);
    }
  }, []);

  const run = useCallback(
    async (action: () => Promise<AuthResult>, nextPhase: AuthPhase) => {
      if (inFlight.current || busy || !client.isReady) return;
      inFlight.current = true;
      clearMessages();
      lastAction.current = { action, phase: nextPhase };
      setPhase(nextPhase);
      let handingOff = false;
      try {
        const result = await action();
        if (result.status === 'redirecting') {
          handingOff = true;
          setPhase(result.phase ?? 'redirecting');
        } else if (result.status === 'complete') {
          handingOff = true;
          scene.celebrate();
          setPhase('signing_in');
        } else {
          apply(result);
        }
      } catch (error) {
        const kind = classifyAuthError(error).kind;
        apply({ status: 'failed', kind, message: copy.errorCopy(kind).message });
      } finally {
        if (!handingOff) {
          inFlight.current = false;
          setPhase(RESTING_PHASE);
        }
      }
    },
    [apply, busy, clearMessages, client.isReady, copy, scene],
  );

  const onRetry = useCallback(() => {
    const previous = lastAction.current;
    if (previous) void run(previous.action, previous.phase);
  }, [run]);

  const onEditEmail = useCallback(() => {
    clearSignupAttemptMarkers();
    clearMessages();
    setStep(INITIAL_STEP);
    lastAction.current = null;
    void client.restart();
  }, [clearMessages, client]);

  const onStartProvider = useCallback(
    async (provider: AuthProviderId) => {
      if (inFlight.current || providerPending !== null || busy || !client.isReady) return;
      inFlight.current = true;
      clearMessages();
      setProviderPending(provider);
      setPhase('redirecting');
      if (mode === 'signup') writeSignupAttemptMarkers(admittedChoices.current);
      else clearSignupAttemptMarkers();
      let handingOff = false;
      try {
        const result = await client.startProvider(provider);
        if (result.status === 'redirecting') {
          handingOff = true;
          rememberAuthMethod({ kind: 'provider', provider });
          return;
        }
        apply(result);
      } catch (error) {
        const kind = classifyAuthError(error).kind;
        apply({ status: 'failed', kind, message: copy.errorCopy(kind).message });
      } finally {
        if (!handingOff) {
          if (mode === 'signup') clearSignupAttemptMarkers();
          inFlight.current = false;
          setProviderPending(null);
          setPhase(RESTING_PHASE);
        }
      }
    },
    [apply, busy, clearMessages, client, copy, mode, providerPending],
  );

  const onStartPasskey = useCallback(() => {
    void run(() => {
      clearSignupAttemptMarkers();
      rememberAuthMethod({ kind: 'method', method: 'passkey' });
      return client.signInWithPasskey();
    }, 'passkey_requested');
  }, [client, run]);

  const onChooseMethod = useCallback(
    (method: AuthMethodId) => {
      void run(
        () => {
          rememberAuthMethod({ kind: 'method', method });
          return client.startMethod(method);
        },
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

  const onSubmitPassword = useCallback(
    (email: string, password: string) => {
      void run(async () => {
        clearSignupAttemptMarkers();
        const result = await client.signInWithPassword(email, password);
        if (providerCheckedThePassword(result)) {
          rememberAuthMethod({ kind: 'method', method: 'password' });
        }
        return result;
      }, 'checking_account');
    },
    [client, run],
  );

  const onRecoverPassword = useCallback(
    (email: string) => {
      void run(() => {
        clearSignupAttemptMarkers();
        return client.startPasswordResetFor(email);
      }, 'sending_code');
    },
    [client, run],
  );

  const retryOffered = errorKind !== null && isRetryableAuthError(errorKind);
  const passwordRefused = erroredField === 'password';
  const passwordFieldShown = mode === 'login';
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
          void run(() => {
            rememberAuthMethod({ kind: 'method', method: 'password' });
            return client.submitPassword(password);
          }, 'verifying');
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
        purpose={step.passwordless ? 'passwordless' : step.purpose}
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
      <>
        <AuthNewPasswordStep
          email={step.email}
          purpose={step.purpose}
          phase={phase}
          error={error}
          fieldError={fieldError}
          onEditEmail={step.purpose === 'sign_up' ? onEditEmail : undefined}
          onSubmit={(password) =>
            void run(() => client.submitNewPassword(password, step.purpose), 'verifying')
          }
        />
        {botProtection}
      </>
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
        error={passwordRefused && !passwordFieldShown ? fieldError : error}
        fieldError={passwordRefused ? null : fieldError}
        passwordError={passwordRefused && passwordFieldShown ? fieldError : null}
        switchOffered={switchOffered}
        retryOffered={retryOffered}
        providerPending={providerPending}
        onRetry={onRetry}
        onSubmit={(email) => {
          void run(async () => {
            clearSignupAttemptMarkers();
            const result = await client.startWithEmail(email);
            if (mode === 'signup' && result.status === 'next' && result.step.kind !== 'notice') {
              writeSignupAttemptMarkers(admittedChoices.current);
            }
            return result;
          }, 'checking_account');
        }}
        onSubmitPassword={onSubmitPassword}
        onForgotPassword={onRecoverPassword}
        onStartProvider={(provider) => void onStartProvider(provider)}
        passkeySignIn={mode === 'login' && passkeySignIn}
        onStartPasskey={onStartPasskey}
        optedOutBySignal={optedOutBySignal}
        onSignupAdmitted={(choices) => {
          admittedChoices.current = choices;
        }}
      />
      {botProtection}
    </>
  );
}
