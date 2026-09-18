'use client';

import { useState } from 'react';

import { useAuthCopy } from './authCopy';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthPasswordField } from './AuthPasswordField';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import { AUTH_ERROR_CLASS } from './authStyles';

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
  const copy = useAuthCopy();
  const [password, setPassword] = useState('');

  return (
    <AuthStepFrame
      heading={copy.text('flow.newPassword.heading', 'Set a new password')}
      detail={
        <p className="text-center">
          {copy.text('flow.newPassword.detail', 'This account needs a new password for {{email}}', {
            email,
          })}
        </p>
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
          label={copy.text('flow.newPassword.label', 'New password')}
          name="new-password"
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

        <AuthSubmitButton label={copy.text('flow.continue', 'Continue')} busy={busy} />
      </form>
    </AuthStepFrame>
  );
}
