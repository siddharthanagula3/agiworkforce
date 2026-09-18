'use client';

import { useEffect, useRef, useState } from 'react';

import { useAuthCopy } from './authCopy';
import { AuthField } from './AuthField';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthMethodPicker } from './AuthMethodPicker';
import { AuthPhaseStatus } from './AuthPhaseStatus';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import { useCountdown } from './useCountdown';
import {
  AUTH_COUNTDOWN_CLASS,
  AUTH_DETAIL_ROW_CLASS,
  AUTH_ERROR_CLASS,
  AUTH_QUIET_BUTTON_CLASS,
  AUTH_STEP_LINKS_CLASS,
} from './authStyles';
import {
  AUTH_CODE_LENGTH,
  AUTH_RESEND_COOLDOWN_SECONDS,
  type AuthMethodId,
  type AuthPhase,
} from './authContract';

const DIGITS_ONLY = /\D/g;
const NUMERIC_PATTERN = '[0-9]*';

export function AuthCodeStep({
  email,
  phase,
  error,
  fieldError,
  resendBlockedSeconds = null,
  methods = [],
  onSubmit,
  onResend,
  onEditEmail,
  onChooseMethod,
}: {
  email: string;
  phase: AuthPhase;
  error: string | null;
  fieldError: string | null;
  resendBlockedSeconds?: number | null;
  methods?: readonly AuthMethodId[];
  onSubmit: (code: string) => void;
  onResend: () => void;
  onEditEmail: () => void;
  onChooseMethod?: (method: AuthMethodId) => void;
}) {
  const copy = useAuthCopy();
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useCountdown(AUTH_RESEND_COOLDOWN_SECONDS);
  const submitted = useRef('');
  const busy = phase !== 'idle';

  useEffect(() => {
    if (resendBlockedSeconds !== null) setCooldown(resendBlockedSeconds);
  }, [resendBlockedSeconds, setCooldown]);

  useEffect(() => {
    if (busy || code.length !== AUTH_CODE_LENGTH || submitted.current === code) return;
    submitted.current = code;
    onSubmit(code);
  }, [busy, code, onSubmit]);

  return (
    <AuthStepFrame
      heading={copy.text('flow.code.heading', 'Check your inbox')}
      detail={
        <div className={AUTH_DETAIL_ROW_CLASS}>
          <span>{copy.text('flow.code.sentTo', 'We sent a code to {{email}}', { email })}</span>
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
          onSubmit(code);
        }}
      >
        <AuthField
          label={copy.text('flow.code.label', 'Code')}
          type="text"
          name="code"
          inputMode="numeric"
          pattern={NUMERIC_PATTERN}
          autoComplete="one-time-code"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
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

        <AuthSubmitButton label={copy.text('flow.continue', 'Continue')} busy={busy} />
      </form>

      <AuthPhaseStatus phase={phase} />

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
          {cooldown > 0
            ? copy.text('flow.code.resendIn', 'Resend code in {{seconds}}s', { seconds: cooldown })
            : copy.text('flow.code.resend', 'Resend code')}
        </button>
      </div>

      {onChooseMethod ? (
        <AuthMethodPicker methods={methods} disabled={busy} onChooseMethod={onChooseMethod} />
      ) : null}
    </AuthStepFrame>
  );
}
