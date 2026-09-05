'use client';

import Link from 'next/link';
import { useId, useState } from 'react';

import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { AuthDivider } from './AuthDivider';
import { AuthField } from './AuthField';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthProviderButtons } from './AuthProviderButtons';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import { AuthSwitchLine, SWITCH_INSTEAD_LABELS } from './AuthSwitchLine';
import {
  AUTH_CHECKBOX_CLASS,
  AUTH_CHECKBOX_ROW_CLASS,
  AUTH_ERROR_CLASS,
  AUTH_LINK_CLASS,
} from './authStyles';
import type { AuthMode, AuthProvider, AuthProviderId } from './authContract';

const HEADINGS: Readonly<Record<AuthMode, string>> = {
  login: 'Welcome back',
  signup: 'Create an account',
};

const EMAIL_FIELD_LABEL = 'Email address';
const CONTINUE_LABEL = 'Continue';

export function AuthEmailStep({
  mode,
  providers,
  switchUrl,
  ready,
  busy,
  error,
  fieldError,
  switchOffered,
  termsAccepted,
  providerPending,
  onTermsChange,
  onSubmit,
  onStartProvider,
}: {
  mode: AuthMode;
  providers: readonly AuthProvider[];
  switchUrl: string;
  ready: boolean;
  busy: boolean;
  error: string | null;
  fieldError: string | null;
  switchOffered: boolean;
  termsAccepted: boolean;
  providerPending: AuthProviderId | null;
  onTermsChange: (accepted: boolean) => void;
  onSubmit: (email: string) => void;
  onStartProvider: (provider: AuthProviderId) => void;
}) {
  const [email, setEmail] = useState('');
  const termsId = useId();
  const isSignup = mode === 'signup';
  const fieldMessage =
    fieldError && switchOffered ? (
      <>
        {fieldError}{' '}
        <Link href={switchUrl} className={AUTH_LINK_CLASS}>
          {SWITCH_INSTEAD_LABELS[mode]}
        </Link>
      </>
    ) : (
      fieldError
    );

  return (
    <AuthStepFrame heading={HEADINGS[mode]} footer={isSignup ? null : <AuthLegalFooter />}>
      <AuthProviderButtons
        providers={providers}
        pending={providerPending}
        disabled={busy || !ready}
        onStart={onStartProvider}
      />

      <AuthDivider />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(email.trim());
        }}
      >
        <AuthField
          label={EMAIL_FIELD_LABEL}
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          error={fieldMessage}
          disabled={busy}
          onChange={(event) => setEmail(event.target.value)}
        />

        {isSignup ? (
          <label htmlFor={termsId} className={AUTH_CHECKBOX_ROW_CLASS}>
            <input
              id={termsId}
              type="checkbox"
              checked={termsAccepted}
              className={AUTH_CHECKBOX_CLASS}
              onChange={(event) => onTermsChange(event.target.checked)}
            />
            <span>
              I agree to the{' '}
              <Link
                href={CANONICAL_POLICY_ROUTES.terms}
                target="_blank"
                rel="noopener noreferrer"
                className={AUTH_LINK_CLASS}
              >
                Terms of Use
              </Link>{' '}
              and{' '}
              <Link
                href={CANONICAL_POLICY_ROUTES.privacy}
                target="_blank"
                rel="noopener noreferrer"
                className={AUTH_LINK_CLASS}
              >
                Privacy Policy
              </Link>
            </span>
          </label>
        ) : null}

        {error ? (
          <p role="alert" className={AUTH_ERROR_CLASS}>
            {error}
          </p>
        ) : null}

        <AuthSubmitButton label={CONTINUE_LABEL} busy={busy} disabled={!ready} />
      </form>

      <AuthSwitchLine mode={mode} href={switchUrl} />
    </AuthStepFrame>
  );
}
