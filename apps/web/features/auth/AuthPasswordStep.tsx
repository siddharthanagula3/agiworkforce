'use client';

import { useState } from 'react';

import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthPasswordField } from './AuthPasswordField';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import {
  AUTH_DETAIL_ROW_CLASS,
  AUTH_ERROR_CLASS,
  AUTH_QUIET_BUTTON_CLASS,
  AUTH_STEP_LINKS_CLASS,
} from './authStyles';

const HEADING = 'Enter your password';
const PASSWORD_FIELD_LABEL = 'Password';
const CONTINUE_LABEL = 'Continue';

export function AuthPasswordStep({
  email,
  busy,
  error,
  fieldError,
  onSubmit,
  onEditEmail,
  onForgotPassword,
  onUseCode,
}: {
  email: string;
  busy: boolean;
  error: string | null;
  fieldError: string | null;
  onSubmit: (password: string) => void;
  onEditEmail: () => void;
  onForgotPassword: () => void;
  onUseCode: () => void;
}) {
  const [password, setPassword] = useState('');

  return (
    <AuthStepFrame
      heading={HEADING}
      detail={
        <div className={AUTH_DETAIL_ROW_CLASS}>
          <span>{email}</span>
          <button type="button" className={AUTH_QUIET_BUTTON_CLASS} onClick={onEditEmail}>
            Edit
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
          label={PASSWORD_FIELD_LABEL}
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

        <AuthSubmitButton label={CONTINUE_LABEL} busy={busy} />
      </form>

      <div className={AUTH_STEP_LINKS_CLASS}>
        <button
          type="button"
          className={AUTH_QUIET_BUTTON_CLASS}
          disabled={busy}
          onClick={onForgotPassword}
        >
          Forgot password?
        </button>
        <button
          type="button"
          className={AUTH_QUIET_BUTTON_CLASS}
          disabled={busy}
          onClick={onUseCode}
        >
          Email me a code instead
        </button>
      </div>
    </AuthStepFrame>
  );
}
