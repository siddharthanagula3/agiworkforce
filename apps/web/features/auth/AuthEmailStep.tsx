'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Spinner } from '@agiworkforce/ui';

import { browserSupportsPasskeys } from '@/lib/identity/passkey-support';

import { useAuthCopy } from './authCopy';
import { AuthDivider } from './AuthDivider';
import { AuthField } from './AuthField';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthPhaseStatus } from './AuthPhaseStatus';
import { AuthProviderButtons } from './AuthProviderButtons';
import { AuthSignupAgreement } from './AuthSignupAgreement';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import { readLastUsedAuthMethod, type AuthLastUsed } from './lastUsedMethod';
import {
  AUTH_BADGE_CLASS,
  AUTH_ERROR_CLASS,
  AUTH_PROVIDER_BUTTON_CLASS,
  AUTH_PROVIDER_LABEL_CLASS,
  AUTH_PROVIDER_STACK_CLASS,
  AUTH_QUIET_BUTTON_CLASS,
  AUTH_STEP_LINKS_CLASS,
} from './authStyles';
import type { AuthPhase, AuthProvider, AuthProviderId } from './authContract';

function typedInto(form: HTMLFormElement | null, name: string): string {
  const field = form?.elements.namedItem(name);
  return field instanceof HTMLInputElement ? field.value : '';
}

export function AuthEmailStep({
  providers,
  hostWayIn,
  ready,
  phase,
  error,
  fieldError,
  retryOffered = false,
  providerPending,
  onSubmit,
  onStartProvider,
  onRetry,
  passkeySignIn = false,
  onStartPasskey,
}: {
  providers: readonly AuthProvider[];
  hostWayIn?: ReactNode;
  ready: boolean;
  phase: AuthPhase;
  error: string | null;
  fieldError: string | null;
  retryOffered?: boolean;
  providerPending: AuthProviderId | null;
  onSubmit: (email: string) => void;
  onStartProvider: (provider: AuthProviderId) => void;
  onRetry?: () => void;
  passkeySignIn?: boolean;
  onStartPasskey?: () => void;
}) {
  const copy = useAuthCopy();
  const agreementId = useId();
  const [email, setEmail] = useState('');
  const [attemptedEmail, setAttemptedEmail] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const [passkeysSupported, setPasskeysSupported] = useState(false);
  const [lastUsed, setLastUsed] = useState<AuthLastUsed | null>(null);
  useEffect(() => {
    setPasskeysSupported(browserSupportsPasskeys());
    setLastUsed(readLastUsedAuthMethod());
  }, []);
  // A browser can fill a saved address before this screen hydrates, when no
  // handler is attached to hear it, and the next render would empty the field.
  useEffect(() => {
    const filledAddress = typedInto(formRef.current, 'email');
    if (filledAddress) setEmail(filledAddress);
  }, []);
  const busy = phase !== 'idle';
  const waitingInBrowser = phase === 'browser' || phase === 'enterprise_browser';
  const startPasskey = passkeySignIn && passkeysSupported ? onStartPasskey : undefined;
  const passkeyLastUsed = lastUsed?.kind === 'method' && lastUsed.method === 'passkey';
  const lastUsedLabel = copy.text('flow.lastUsed', 'Last used');
  const otherWaysOffered = providers.length > 0 || startPasskey !== undefined;

  const attempt = (action: () => void) => {
    setAttemptedEmail(email);
    action();
  };

  return (
    <AuthStepFrame
      heading={copy.text('flow.heading.entry', 'Log in or sign up')}
      footer={<AuthLegalFooter />}
    >
      {hostWayIn}
      <AuthProviderButtons
        providers={providers}
        pending={providerPending}
        disabled={busy || !ready}
        lastUsed={lastUsed?.kind === 'provider' ? lastUsed.provider : null}
        lastUsedLabel={lastUsedLabel}
        onStart={(provider) => attempt(() => onStartProvider(provider))}
        describedBy={agreementId}
      />

      {startPasskey ? (
        <div
          className={
            providers.length > 0 ? `${AUTH_PROVIDER_STACK_CLASS} mt-3` : AUTH_PROVIDER_STACK_CLASS
          }
        >
          <button
            type="button"
            className={AUTH_PROVIDER_BUTTON_CLASS}
            disabled={busy || !ready || providerPending !== null}
            aria-busy={phase === 'passkey_requested' || undefined}
            aria-describedby={agreementId}
            onClick={() => attempt(startPasskey)}
          >
            {phase === 'passkey_requested' ? <Spinner size="sm" /> : null}
            <span className={AUTH_PROVIDER_LABEL_CLASS}>
              {copy.text('flow.passkey.cta', 'Sign in with a passkey or security key')}
            </span>
            {passkeyLastUsed ? <span className={AUTH_BADGE_CLASS}>{lastUsedLabel}</span> : null}
          </button>
        </div>
      ) : null}

      {otherWaysOffered ? <AuthDivider aboveField /> : null}

      <form
        ref={formRef}
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          attempt(() => onSubmit(email.trim()));
        }}
      >
        <AuthField
          label={copy.text('flow.email.label', 'Email address')}
          type="email"
          name="email"
          inputMode="email"
          autoComplete={passkeysSupported ? 'email webauthn' : 'email'}
          required
          placeholder={copy.text('flow.email.placeholder', 'you@example.com')}
          value={email}
          error={fieldError}
          disabled={busy}
          onChange={(event) => setEmail(event.target.value)}
        />

        {error ? (
          <p role="alert" className={AUTH_ERROR_CLASS}>
            {error}
          </p>
        ) : null}

        <AuthSubmitButton
          label={copy.text('flow.continue', 'Continue')}
          busy={busy && !waitingInBrowser}
          disabled={!ready || waitingInBrowser}
          describedBy={agreementId}
        />
      </form>

      <AuthSignupAgreement id={agreementId} />

      <AuthPhaseStatus phase={phase} />

      {retryOffered && onRetry && email === attemptedEmail ? (
        <div className={AUTH_STEP_LINKS_CLASS}>
          <button
            type="button"
            className={AUTH_QUIET_BUTTON_CLASS}
            disabled={busy}
            onClick={() => attempt(onRetry)}
          >
            {copy.text('flow.retry', 'Try again')}
          </button>
        </div>
      ) : null}
    </AuthStepFrame>
  );
}
