'use client';

import Link from 'next/link';
import { useState } from 'react';

import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { AuthDivider } from './AuthDivider';
import { AuthField } from './AuthField';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthProviderButtons } from './AuthProviderButtons';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import { AuthSwitchLine, SWITCH_INSTEAD_LABELS } from './AuthSwitchLine';
import { AUTH_ERROR_CLASS, AUTH_LINK_CLASS } from './authStyles';
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
  providerPending,
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
  providerPending: AuthProviderId | null;
  onSubmit: (email: string) => void;
  onStartProvider: (provider: AuthProviderId) => void;
}) {
  const [email, setEmail] = useState('');
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
    <AuthStepFrame
      heading={HEADINGS[mode]}
      footer={<AuthLegalFooter variant={isSignup ? 'signup' : 'links'} />}
    >
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
