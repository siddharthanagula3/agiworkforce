'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';

import { browserSupportsPasskeys } from '@/lib/identity/passkey-support';

import { useAuthCopy } from './authCopy';
import { AuthDivider } from './AuthDivider';
import { AuthField } from './AuthField';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthPhaseStatus } from './AuthPhaseStatus';
import { AuthProviderButtons } from './AuthProviderButtons';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import { AuthSwitchLine, SWITCH_INSTEAD_COPY } from './AuthSwitchLine';
import { readLastUsedAuthMethod, type AuthLastUsed } from './lastUsedMethod';
import {
  AUTH_BADGE_CLASS,
  AUTH_ERROR_CLASS,
  AUTH_LINK_CLASS,
  AUTH_PROVIDER_BUTTON_CLASS,
  AUTH_PROVIDER_STACK_CLASS,
  AUTH_QUIET_BUTTON_CLASS,
  AUTH_STEP_LINKS_CLASS,
} from './authStyles';
import type { AuthMode, AuthPhase, AuthProvider, AuthProviderId } from './authContract';

const HEADING_DEFAULTS: Readonly<Record<AuthMode, { key: string; label: string }>> = {
  login: { key: 'flow.heading.login', label: 'Welcome back' },
  signup: { key: 'flow.heading.signup', label: 'Create an account' },
};

export function AuthEmailStep({
  mode,
  providers,
  switchUrl,
  ready,
  phase,
  error,
  fieldError,
  switchOffered,
  retryOffered = false,
  providerPending,
  onSubmit,
  onStartProvider,
  onRetry,
  passkeySignIn = false,
  onStartPasskey,
}: {
  mode: AuthMode;
  providers: readonly AuthProvider[];
  switchUrl: string;
  ready: boolean;
  phase: AuthPhase;
  error: string | null;
  fieldError: string | null;
  switchOffered: boolean;
  retryOffered?: boolean;
  providerPending: AuthProviderId | null;
  onSubmit: (email: string) => void;
  onStartProvider: (provider: AuthProviderId) => void;
  onRetry?: () => void;
  passkeySignIn?: boolean;
  onStartPasskey?: () => void;
}) {
  const copy = useAuthCopy();
  const [email, setEmail] = useState('');
  const [passkeysSupported, setPasskeysSupported] = useState(false);
  const [lastUsed, setLastUsed] = useState<AuthLastUsed | null>(null);
  useEffect(() => {
    setPasskeysSupported(browserSupportsPasskeys());
    setLastUsed(readLastUsedAuthMethod());
  }, []);
  const busy = phase !== 'idle';
  const offerPasskey = passkeySignIn && passkeysSupported && onStartPasskey !== undefined;
  const isSignup = mode === 'signup';
  const passkeyLastUsed = lastUsed?.kind === 'method' && lastUsed.method === 'passkey';
  const lastUsedLabel = copy.text('flow.lastUsed', 'Last used');
  const fieldMessage =
    fieldError && switchOffered ? (
      <>
        {fieldError}{' '}
        <Link href={switchUrl} className={AUTH_LINK_CLASS}>
          {copy.text(SWITCH_INSTEAD_COPY[mode].key, SWITCH_INSTEAD_COPY[mode].label)}
        </Link>
      </>
    ) : (
      fieldError
    );

  return (
    <AuthStepFrame
      heading={copy.text(HEADING_DEFAULTS[mode].key, HEADING_DEFAULTS[mode].label)}
      footer={<AuthLegalFooter variant={isSignup ? 'signup' : 'links'} />}
    >
      <AuthProviderButtons
        providers={providers}
        pending={providerPending}
        disabled={busy || !ready}
        lastUsed={lastUsed?.kind === 'provider' ? lastUsed.provider : null}
        lastUsedLabel={lastUsedLabel}
        onStart={onStartProvider}
      />

      {offerPasskey ? (
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
            onClick={onStartPasskey}
          >
            {phase === 'passkey_requested' ? <Spinner size="sm" /> : null}
            <span>{copy.text('flow.passkey.cta', 'Sign in with a passkey or security key')}</span>
            {passkeyLastUsed ? <span className={AUTH_BADGE_CLASS}>{lastUsedLabel}</span> : null}
          </button>
        </div>
      ) : null}

      <AuthDivider />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(email.trim());
        }}
      >
        <AuthField
          label={copy.text('flow.email.label', 'Email address')}
          type="email"
          name="email"
          inputMode="email"
          autoComplete={passkeysSupported ? 'email webauthn' : 'email'}
          autoFocus
          required
          value={email}
          error={fieldMessage}
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
          busy={busy}
          disabled={!ready}
        />
      </form>

      <AuthPhaseStatus phase={phase} />

      {retryOffered && onRetry ? (
        <div className={AUTH_STEP_LINKS_CLASS}>
          <button
            type="button"
            className={AUTH_QUIET_BUTTON_CLASS}
            disabled={busy}
            onClick={onRetry}
          >
            {copy.text('flow.retry', 'Try again')}
          </button>
        </div>
      ) : null}

      <AuthSwitchLine mode={mode} href={switchUrl} />
    </AuthStepFrame>
  );
}
