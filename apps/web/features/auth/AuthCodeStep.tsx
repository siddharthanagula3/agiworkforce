'use client';

import { useEffect, useRef, useState } from 'react';

import { AuthField } from './AuthField';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import {
  AUTH_COUNTDOWN_CLASS,
  AUTH_DETAIL_ROW_CLASS,
  AUTH_ERROR_CLASS,
  AUTH_QUIET_BUTTON_CLASS,
  AUTH_STEP_LINKS_CLASS,
} from './authStyles';
import { AUTH_CODE_LENGTH, AUTH_RESEND_COOLDOWN_SECONDS } from './authContract';

const HEADING = 'Check your inbox';
const CODE_FIELD_LABEL = 'Code';
const CONTINUE_LABEL = 'Continue';
const DIGITS_ONLY = /\D/g;
const COOLDOWN_TICK_MS = 1000;

export function AuthCodeStep({
  email,
  busy,
  error,
  fieldError,
  onSubmit,
  onResend,
  onEditEmail,
}: {
  email: string;
  busy: boolean;
  error: string | null;
  fieldError: string | null;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onEditEmail: () => void;
}) {
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(AUTH_RESEND_COOLDOWN_SECONDS);
  const submitted = useRef('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((current) => current - 1), COOLDOWN_TICK_MS);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (busy || code.length !== AUTH_CODE_LENGTH || submitted.current === code) return;
    submitted.current = code;
    onSubmit(code);
  }, [busy, code, onSubmit]);

  return (
    <AuthStepFrame
      heading={HEADING}
      detail={
        <div className={AUTH_DETAIL_ROW_CLASS}>
          <span>We sent a code to {email}</span>
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
          onSubmit(code);
        }}
      >
        <AuthField
          label={CODE_FIELD_LABEL}
          type="text"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={AUTH_CODE_LENGTH}
          value={code}
          error={fieldError}
          disabled={busy}
          onChange={(event) =>
            setCode(event.target.value.replace(DIGITS_ONLY, '').slice(0, AUTH_CODE_LENGTH))
          }
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
          className={cooldown > 0 ? AUTH_COUNTDOWN_CLASS : AUTH_QUIET_BUTTON_CLASS}
          disabled={busy || cooldown > 0}
          onClick={() => {
            setCooldown(AUTH_RESEND_COOLDOWN_SECONDS);
            onResend();
          }}
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </AuthStepFrame>
  );
}
