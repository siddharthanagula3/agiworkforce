'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';

import { useAuthSceneBridge } from '@agiworkforce/ui/auth-scene';

import type { SignupAttemptChoices } from '@/app/signup/signupAttemptMarkers';
import { browserSupportsPasskeys } from '@/lib/identity/passkey-support';

import { useAuthCopy } from './authCopy';
import { AuthDataUseNotice } from './AuthDataUseNotice';
import { AuthDivider } from './AuthDivider';
import { AuthField } from './AuthField';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthPasswordField } from './AuthPasswordField';
import { AuthPhaseStatus } from './AuthPhaseStatus';
import { AuthMarketingEmailConsent } from './AuthMarketingEmailConsent';
import { AuthProviderButtons } from './AuthProviderButtons';
import { AuthSignupConsent } from './AuthSignupConsent';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import { AuthSwitchLine, SWITCH_INSTEAD_COPY } from './AuthSwitchLine';
import { readLastUsedAuthMethod, type AuthLastUsed } from './lastUsedMethod';
import {
  AUTH_BADGE_CLASS,
  AUTH_BESIDE_TEXT_BUTTON_CLASS,
  AUTH_ERROR_CLASS,
  AUTH_FIELD_AID_CLASS,
  AUTH_FIELD_STACK_CLASS,
  AUTH_LINK_CLASS,
  AUTH_OPTIONAL_CONSENT_CLASS,
  AUTH_PROVIDER_BUTTON_CLASS,
  AUTH_PROVIDER_LABEL_CLASS,
  AUTH_PROVIDER_STACK_CLASS,
  AUTH_PROVIDERS_AFTER_ACTION_CLASS,
  AUTH_QUIET_BUTTON_CLASS,
  AUTH_STEP_LINKS_CLASS,
} from './authStyles';
import { useMarketingEmailChoice } from './marketingEmailChoice';
import { useSignupConsentGate } from './useSignupConsentGate';
import type { AuthMode, AuthPhase, AuthProvider, AuthProviderId } from './authContract';

const HEADING_DEFAULTS: Readonly<Record<AuthMode, { key: string; label: string }>> = {
  login: { key: 'flow.heading.login', label: 'Welcome back' },
  signup: { key: 'flow.heading.signup', label: 'Create your account' },
};

const DETAIL_DEFAULTS: Readonly<Record<AuthMode, { key: string; label: string }>> = {
  login: { key: 'flow.detail.login', label: 'Log in to AGI Workforce.' },
  signup: {
    key: 'flow.detail.signup',
    label: 'Get started with AGI Workforce and put AI to work for you.',
  },
};

function typedInto(form: HTMLFormElement | null, name: string): string {
  const field = form?.elements.namedItem(name);
  return field instanceof HTMLInputElement ? field.value : '';
}

export function AuthEmailStep({
  mode,
  providers,
  switchUrl,
  ready,
  phase,
  error,
  fieldError,
  passwordError = null,
  switchOffered,
  retryOffered = false,
  providerPending,
  onSubmit,
  onSubmitPassword,
  onForgotPassword,
  onStartProvider,
  onRetry,
  passkeySignIn = false,
  onStartPasskey,
  optedOutBySignal = false,
  onSignupAdmitted,
}: {
  mode: AuthMode;
  providers: readonly AuthProvider[];
  switchUrl: string;
  ready: boolean;
  phase: AuthPhase;
  error: string | null;
  fieldError: string | null;
  passwordError?: string | null;
  switchOffered: boolean;
  retryOffered?: boolean;
  providerPending: AuthProviderId | null;
  onSubmit: (email: string) => void;
  onSubmitPassword?: (email: string, password: string) => void;
  onForgotPassword?: (email: string) => void;
  onStartProvider: (provider: AuthProviderId) => void;
  onRetry?: () => void;
  passkeySignIn?: boolean;
  onStartPasskey?: () => void;
  optedOutBySignal?: boolean;
  onSignupAdmitted?: (choices: SignupAttemptChoices) => void;
}) {
  const copy = useAuthCopy();
  const scene = useAuthSceneBridge();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordMode, setPasswordMode] = useState(mode);
  const [attempted, setAttempted] = useState({ email: '', password: '' });
  const formRef = useRef<HTMLFormElement>(null);
  const [passkeysSupported, setPasskeysSupported] = useState(false);
  const [lastUsed, setLastUsed] = useState<AuthLastUsed | null>(null);
  const isSignup = mode === 'signup';
  const consent = useSignupConsentGate(isSignup);
  const marketingEmail = useMarketingEmailChoice(optedOutBySignal);
  if (passwordMode !== mode) {
    setPasswordMode(mode);
    setPassword('');
    marketingEmail.choose(false);
  }
  useEffect(() => {
    setPasskeysSupported(browserSupportsPasskeys());
    setLastUsed(readLastUsedAuthMethod());
  }, []);
  // A browser can fill a saved sign-in before this screen hydrates, when no
  // handler is attached to hear it, and the next render would empty the fields.
  useEffect(() => {
    const filledAddress = typedInto(formRef.current, 'email');
    const filledPassword = typedInto(formRef.current, 'password');
    if (filledAddress) setEmail(filledAddress);
    if (filledPassword) setPassword(filledPassword);
  }, []);
  const busy = phase !== 'idle';
  const submitPassword = isSignup ? undefined : onSubmitPassword;
  const recoverPassword = submitPassword ? onForgotPassword : undefined;
  const offerPasskey = passkeySignIn && passkeysSupported && onStartPasskey !== undefined;
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

  const attempt = (action: () => void) => {
    const admitted = consent.admit(() => {
      setAttempted({ email, password });
      if (isSignup) onSignupAdmitted?.({ marketingEmail: marketingEmail.wanted });
      action();
    });
    if (!admitted) scene.setMood('error');
  };
  const retryStillMatchesTheFields = email === attempted.email && password === attempted.password;

  const submit = () => {
    const address = email.trim();
    if (submitPassword && password.length > 0) submitPassword(address, password);
    else onSubmit(address);
  };

  const requireAddress = (): string | null => {
    const field = formRef.current?.elements.namedItem('email');
    if (field instanceof HTMLInputElement && !field.checkValidity()) {
      field.reportValidity();
      field.focus();
      return null;
    }
    return email.trim();
  };

  const onConsentChange = (next: boolean) => {
    if (next && consent.refused) scene.setMood(error || fieldError ? 'error' : 'neutral');
    consent.confirm(next);
  };

  const otherWaysIn = (
    <>
      <AuthProviderButtons
        providers={providers}
        pending={providerPending}
        disabled={busy || !ready}
        lastUsed={lastUsed?.kind === 'provider' ? lastUsed.provider : null}
        lastUsedLabel={lastUsedLabel}
        onStart={(provider) => attempt(() => onStartProvider(provider))}
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
            onClick={() => attempt(onStartPasskey)}
          >
            {phase === 'passkey_requested' ? <Spinner size="sm" /> : null}
            <span className={AUTH_PROVIDER_LABEL_CLASS}>
              {copy.text('flow.passkey.cta', 'Sign in with a passkey or security key')}
            </span>
            {passkeyLastUsed ? <span className={AUTH_BADGE_CLASS}>{lastUsedLabel}</span> : null}
          </button>
        </div>
      ) : null}
    </>
  );

  return (
    <AuthStepFrame
      heading={copy.text(HEADING_DEFAULTS[mode].key, HEADING_DEFAULTS[mode].label)}
      detail={<p>{copy.text(DETAIL_DEFAULTS[mode].key, DETAIL_DEFAULTS[mode].label)}</p>}
      footer={
        <>
          <AuthSwitchLine mode={mode} href={switchUrl} />
          <AuthLegalFooter />
        </>
      }
    >
      {isSignup ? (
        <>
          {otherWaysIn}
          <AuthDivider aboveField />
        </>
      ) : null}

      {/* A submission no script handled must never write the password into the address bar. */}
      <form
        ref={formRef}
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          attempt(submit);
        }}
      >
        <AuthField
          label={copy.text('flow.email.label', 'Email address')}
          type="email"
          name="email"
          inputMode="email"
          autoComplete={passkeysSupported ? 'email webauthn' : 'email'}
          autoFocus={!isSignup}
          required
          placeholder={copy.text('flow.email.placeholder', 'you@example.com')}
          value={email}
          error={fieldMessage}
          disabled={busy}
          onChange={(event) => setEmail(event.target.value)}
        />

        {submitPassword ? (
          <div className={AUTH_FIELD_STACK_CLASS}>
            <AuthPasswordField
              label={copy.text('flow.password.label', 'Password')}
              value={password}
              error={passwordError}
              disabled={busy}
              autoComplete="current-password"
              autoFocus={false}
              required={false}
              onChange={setPassword}
            />
          </div>
        ) : null}

        {recoverPassword ? (
          <div className={AUTH_FIELD_AID_CLASS}>
            <button
              type="button"
              className={AUTH_BESIDE_TEXT_BUTTON_CLASS}
              disabled={busy || !ready}
              onClick={() => {
                const address = requireAddress();
                if (address !== null) attempt(() => recoverPassword(address));
              }}
            >
              {copy.text('flow.password.forgot', 'Forgot password?')}
            </button>
          </div>
        ) : null}

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

      {isSignup ? null : <div className={AUTH_PROVIDERS_AFTER_ACTION_CLASS}>{otherWaysIn}</div>}

      {isSignup ? (
        <>
          <AuthSignupConsent gate={{ ...consent, confirm: onConsentChange }} disabled={busy} />
          <AuthMarketingEmailConsent
            choice={marketingEmail}
            disabled={busy}
            className={AUTH_OPTIONAL_CONSENT_CLASS}
          />
        </>
      ) : null}

      {isSignup ? <AuthDataUseNotice /> : null}

      {retryOffered && onRetry && retryStillMatchesTheFields ? (
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
