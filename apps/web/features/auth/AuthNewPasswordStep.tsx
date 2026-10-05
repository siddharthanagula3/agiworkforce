'use client';

import { useState } from 'react';

import { useAuthCopy } from './authCopy';
import { AuthHiddenUsername } from './AuthHiddenUsername';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthPasswordField } from './AuthPasswordField';
import { AuthPhaseStatus } from './AuthPhaseStatus';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import {
  AUTH_BESIDE_TEXT_BUTTON_CLASS,
  AUTH_DETAIL_ROW_CLASS,
  AUTH_ERROR_CLASS,
} from './authStyles';
import { AUTH_PASSWORD_MIN_LENGTH, type AuthPasswordPurpose, type AuthPhase } from './authContract';

type StepCopy = Readonly<Record<'heading' | 'detail' | 'label', { key: string; label: string }>>;

const STEP_COPY: Readonly<Record<AuthPasswordPurpose, StepCopy>> = {
  reset: {
    heading: { key: 'flow.newPassword.heading', label: 'Set a new password' },
    detail: {
      key: 'flow.newPassword.detail',
      label: 'This account needs a new password for {{email}}',
    },
    label: { key: 'flow.newPassword.label', label: 'New password' },
  },
  sign_up: {
    heading: { key: 'flow.createPassword.heading', label: 'Create a password' },
    detail: {
      key: 'flow.createPassword.detail',
      label: 'You will use it with {{email}} to log in',
    },
    label: { key: 'flow.createPassword.label', label: 'Password' },
  },
};

const RULE_COPY = {
  key: 'flow.newPassword.rule',
  label:
    'Use at least {{minimum}} characters. Passwords that are easy to guess or found in a data breach are not accepted.',
} as const;

export function AuthNewPasswordStep({
  email,
  purpose = 'reset',
  phase,
  error,
  fieldError,
  onSubmit,
  onEditEmail,
}: {
  email: string;
  purpose?: AuthPasswordPurpose;
  phase: AuthPhase;
  error: string | null;
  fieldError: string | null;
  onSubmit: (password: string) => void;
  onEditEmail?: () => void;
}) {
  const copy = useAuthCopy();
  const [password, setPassword] = useState('');
  const busy = phase !== 'idle';
  const text = STEP_COPY[purpose];
  const detail = copy.text(text.detail.key, text.detail.label, { email });

  return (
    <AuthStepFrame
      heading={copy.text(text.heading.key, text.heading.label)}
      detail={
        onEditEmail ? (
          <div className={AUTH_DETAIL_ROW_CLASS}>
            <span>{detail}</span>
            <button
              type="button"
              className={AUTH_BESIDE_TEXT_BUTTON_CLASS}
              disabled={busy}
              onClick={onEditEmail}
            >
              {copy.text('flow.edit', 'Edit')}
            </button>
          </div>
        ) : (
          <p>{detail}</p>
        )
      }
      footer={<AuthLegalFooter />}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(password);
        }}
      >
        <AuthHiddenUsername email={email} />
        <AuthPasswordField
          label={copy.text(text.label.key, text.label.label)}
          name="new-password"
          value={password}
          error={fieldError}
          description={copy.text(RULE_COPY.key, RULE_COPY.label, {
            minimum: AUTH_PASSWORD_MIN_LENGTH,
          })}
          disabled={busy}
          autoComplete="new-password"
          onChange={setPassword}
        />

        {error ? (
          <p role="alert" className={AUTH_ERROR_CLASS}>
            {error}
          </p>
        ) : null}

        <AuthSubmitButton label={copy.text('flow.continue', 'Continue')} busy={busy} />
      </form>

      <AuthPhaseStatus phase={phase} />
    </AuthStepFrame>
  );
}
