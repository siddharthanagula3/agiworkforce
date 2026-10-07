'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { useAuthSceneBridge } from '@agiworkforce/ui/auth-scene';

import { classifyAuthError } from '@/lib/auth/error-taxonomy';
import { usePrimaryEmailConfirmation } from '@/lib/identity/client';
import { AuthCodeStep } from './AuthCodeStep';
import { useAuthCopy } from './authCopy';
import { AuthPhaseStatus } from './AuthPhaseStatus';
import { AuthStepFrame } from './AuthStepFrame';
import { AUTH_ERROR_CLASS, AUTH_MUTED_LINE_CLASS, AUTH_PRIMARY_BUTTON_CLASS } from './authStyles';
import type { AuthPhase } from './authContract';

export function ConfirmEmailStep({ footer }: { footer: ReactNode }) {
  const confirmation = usePrimaryEmailConfirmation();
  const router = useRouter();
  const copy = useAuthCopy();
  const scene = useAuthSceneBridge();
  const [phase, setPhase] = useState<AuthPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [sessionsFailed, setSessionsFailed] = useState(false);
  const inFlight = useRef(false);
  const codeRequested = useRef(false);
  const heading = copy.text('flow.code.confirmHeading', 'Confirm your email address');

  useEffect(() => {
    if (error !== null || fieldError !== null || sessionsFailed) scene.setMood('error');
    else if (phase !== 'idle') scene.setMood('pending');
    else scene.setMood('neutral');
  }, [error, fieldError, phase, scene, sessionsFailed]);

  const run = useCallback(
    async (action: () => Promise<void>, nextPhase: AuthPhase): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setError(null);
      setFieldError(null);
      setPhase(nextPhase);
      try {
        await action();
        return true;
      } catch (cause) {
        const descriptor = classifyAuthError(cause);
        const message = descriptor.vendorMessage ?? copy.errorCopy(descriptor.kind).message;
        if (descriptor.field) setFieldError(message);
        else setError(message);
        return false;
      } finally {
        inFlight.current = false;
        setPhase('idle');
      }
    },
    [copy],
  );

  useEffect(() => {
    if (!confirmation.isLoaded || !confirmation.email || codeRequested.current) return;
    codeRequested.current = true;
    void run(confirmation.sendCode, 'sending_code');
  }, [confirmation.email, confirmation.isLoaded, confirmation.sendCode, run]);

  const finish = useCallback(async () => {
    setSessionsFailed(false);
    if (!(await run(confirmation.endOtherSessions, 'signing_in'))) {
      setSessionsFailed(true);
      return;
    }
    setPhase('signing_in');
    router.refresh();
  }, [confirmation.endOtherSessions, router, run]);

  const submit = useCallback(
    async (code: string) => {
      if (!(await run(() => confirmation.confirm(code), 'verifying'))) return;
      setConfirmed(true);
      await finish();
    },
    [confirmation, finish, run],
  );

  if (!confirmation.isLoaded) {
    return (
      <AuthStepFrame heading={heading} footer={footer}>
        <AuthPhaseStatus phase="checking_account" />
      </AuthStepFrame>
    );
  }

  if (!confirmation.email) {
    return (
      <AuthStepFrame heading={heading} footer={footer} focusHeading>
        <p className={AUTH_MUTED_LINE_CLASS} role="status">
          {copy.text(
            'flow.code.confirmNoAddress',
            'This account has no email address to confirm, so it cannot be used yet. Contact support to finish setting it up.',
          )}
        </p>
      </AuthStepFrame>
    );
  }

  if (confirmed) {
    return (
      <AuthStepFrame
        heading={copy.text('flow.code.confirmedHeading', 'Email address confirmed')}
        footer={footer}
        focusHeading
      >
        {sessionsFailed ? (
          <>
            <p role="alert" className={AUTH_ERROR_CLASS}>
              {copy.text(
                'flow.code.confirmedSessionsFailed',
                'Your address is confirmed, but this account could not be signed out everywhere else yet. Try again to continue.',
              )}
            </p>
            <button
              type="button"
              className={AUTH_PRIMARY_BUTTON_CLASS}
              disabled={phase !== 'idle'}
              onClick={() => void finish()}
            >
              {copy.text('flow.retry', 'Try again')}
            </button>
          </>
        ) : null}
        <AuthPhaseStatus phase={phase} />
      </AuthStepFrame>
    );
  }

  return (
    <AuthCodeStep
      email={confirmation.email}
      purpose="confirm_email"
      phase={phase}
      error={error}
      fieldError={fieldError}
      onSubmit={(code) => void submit(code)}
      onResend={() => void run(confirmation.sendCode, 'sending_code')}
      footer={footer}
    />
  );
}
