'use client';

import { useState } from 'react';

import { useAuthCopy } from './authCopy';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthMethodPicker } from './AuthMethodPicker';
import { AuthPasswordField } from './AuthPasswordField';
import { AuthPhaseStatus } from './AuthPhaseStatus';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import {
  AUTH_DETAIL_ROW_CLASS,
  AUTH_ERROR_CLASS,
  AUTH_QUIET_BUTTON_CLASS,
  AUTH_STEP_LINKS_CLASS,
} from './authStyles';
import type { AuthMethodId, AuthPhase } from './authContract';

export function AuthPasswordStep({
  email,
  phase,
  error,
  fieldError,
  methods = [],
  onSubmit,
  onEditEmail,
  onForgotPassword,
  onChooseMethod,
}: {
  email: string;
  phase: AuthPhase;
  error: string | null;
  fieldError: string | null;
  methods?: readonly AuthMethodId[];
  onSubmit: (password: string) => void;
  onEditEmail: () => void;
  onForgotPassword: () => void;
  onChooseMethod: (method: AuthMethodId) => void;
}) {
  const copy = useAuthCopy();
  const [password, setPassword] = useState('');
  const busy = phase !== 'idle';

  return (
    <AuthStepFrame
      heading={copy.text('flow.password.heading', 'Enter your password')}
      detail={
        <div className={AUTH_DETAIL_ROW_CLASS}>
          <span>{email}</span>
          <button type="button" className={AUTH_QUIET_BUTTON_CLASS} onClick={onEditEmail}>
            {copy.text('flow.edit', 'Edit')}
          </button>
        </div>
      }
      footer={<AuthLegalFooter />}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(password);
        }}
      >
        <AuthPasswordField
          label={copy.text('flow.password.label', 'Password')}
          value={password}
          error={fieldError}
          disabled={busy}
          autoComplete="current-password"
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

      <div className={AUTH_STEP_LINKS_CLASS}>
        <button
          type="button"
          className={AUTH_QUIET_BUTTON_CLASS}
          disabled={busy}
          onClick={onForgotPassword}
        >
          {copy.text('flow.password.forgot', 'Forgot password?')}
        </button>
      </div>

      <AuthMethodPicker methods={methods} disabled={busy} onChooseMethod={onChooseMethod} />
    </AuthStepFrame>
  );
}
