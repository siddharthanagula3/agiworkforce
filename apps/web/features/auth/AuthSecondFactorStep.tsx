'use client';

import { useState } from 'react';

import { AuthField } from './AuthField';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import { AUTH_ERROR_CLASS, AUTH_QUIET_BUTTON_CLASS, AUTH_STEP_LINKS_CLASS } from './authStyles';
import type { AuthSecondFactor } from './authContract';

const HEADING = 'Confirm it is you';
const CONTINUE_LABEL = 'Continue';

const DETAILS: Readonly<Record<AuthSecondFactor['kind'], string>> = {
  authenticator: 'Enter the code from your authenticator app',
  text_message: 'Enter the code we sent by text message',
  backup_code: 'Enter one of your backup codes',
};

export function AuthSecondFactorStep({
  factor,
  busy,
  error,
  fieldError,
  onSubmit,
  onEditEmail,
}: {
  factor: AuthSecondFactor;
  busy: boolean;
  error: string | null;
  fieldError: string | null;
  onSubmit: (code: string) => void;
  onEditEmail: () => void;
}) {
  const [code, setCode] = useState('');
  const detail = factor.hint ? `${DETAILS[factor.kind]} to ${factor.hint}` : DETAILS[factor.kind];

  return (
    <AuthStepFrame
      heading={HEADING}
      detail={<p className="text-center">{detail}</p>}
      footer={<AuthLegalFooter />}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(code.trim());
        }}
      >
        <AuthField
          label={factor.label}
          type="text"
          name="code"
          inputMode={factor.kind === 'backup_code' ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          autoFocus
          required
          value={code}
          error={fieldError}
          disabled={busy}
          onChange={(event) => setCode(event.target.value)}
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
          onClick={onEditEmail}
        >
          Use a different email
        </button>
      </div>
    </AuthStepFrame>
  );
}
