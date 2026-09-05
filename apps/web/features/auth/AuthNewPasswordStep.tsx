'use client';

import { useState } from 'react';

import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthPasswordField } from './AuthPasswordField';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import { AUTH_ERROR_CLASS } from './authStyles';

const HEADING = 'Set a new password';
const PASSWORD_FIELD_LABEL = 'New password';
const CONTINUE_LABEL = 'Continue';

export function AuthNewPasswordStep({
  email,
  busy,
  error,
  fieldError,
  onSubmit,
}: {
  email: string;
  busy: boolean;
  error: string | null;
  fieldError: string | null;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState('');

  return (
    <AuthStepFrame
      heading={HEADING}
      detail={<p className="text-center">{`This account needs a new password for ${email}`}</p>}
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
          autoComplete="new-password"
          onChange={setPassword}
        />

        {error ? (
          <p role="alert" className={AUTH_ERROR_CLASS}>
            {error}
          </p>
        ) : null}

        <AuthSubmitButton label={CONTINUE_LABEL} busy={busy} />
      </form>
    </AuthStepFrame>
  );
}
