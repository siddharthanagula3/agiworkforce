'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

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
  AUTH_BESIDE_TEXT_BUTTON_CLASS,
  AUTH_QUIET_BUTTON_CLASS,
  AUTH_STEP_LINKS_CLASS,
} from './authStyles';
import {
  AUTH_CODE_LENGTH,
  AUTH_RESEND_COOLDOWN_SECONDS,
  type AuthCodeScreen,
  type AuthMethodId,
  type AuthPhase,
} from './authContract';

const DIGITS_ONLY = /\D/g;
const NUMERIC_PATTERN = '[0-9]*';

const INBOX_COPY = {
  heading: { key: 'flow.code.heading', label: 'Check your inbox' },
  sentTo: { key: 'flow.code.sentTo', label: 'We sent a code to {{email}}' },
} as const;

const DEVICE_COPY = {
  heading: { key: 'flow.code.deviceHeading', label: 'Verify this device' },
  sentTo: {
    key: 'flow.code.deviceSentTo',
    label: 'You are signing in on a new device. We emailed a code to {{email}}',
  },
} as const;

const CONFIRM_COPY = {
  heading: { key: 'flow.code.confirmHeading', label: 'Confirm your email address' },
  sentTo: {
    key: 'flow.code.confirmSentTo',
    label:
      'This account’s address has not been confirmed yet. We emailed a code to {{email}}. Confirming it signs this account out everywhere else.',
  },
} as const;

const PASSWORDLESS_COPY = {
  heading: INBOX_COPY.heading,
  sentTo: {
    key: 'flow.code.passwordlessSentTo',
    label: 'This account does not use a password, so we emailed a code to {{email}}',
  },
} as const;

function copyFor(screen: AuthCodeScreen) {
  if (screen === 'device') return DEVICE_COPY;
  if (screen === 'confirm_email') return CONFIRM_COPY;
  if (screen === 'passwordless') return PASSWORDLESS_COPY;
  return INBOX_COPY;
}

export function AuthCodeStep({
  email,
  purpose = 'sign_in',
  phase,
  error,
  fieldError,
  resendBlockedSeconds = null,
  methods = [],
  onSubmit,
  onResend,
  onEditEmail,
  onChooseMethod,
  footer,
}: {
  email: string;
  purpose?: AuthCodeScreen;
  phase: AuthPhase;
  error: string | null;
  fieldError: string | null;
  resendBlockedSeconds?: number | null;
  methods?: readonly AuthMethodId[];
  onSubmit: (code: string) => void;
  onResend: () => void;
  onEditEmail?: () => void;
  onChooseMethod?: (method: AuthMethodId) => void;
  footer?: ReactNode;
}) {
  const copy = useAuthCopy();
  const text = copyFor(purpose);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useCountdown(AUTH_RESEND_COOLDOWN_SECONDS);
  const submitted = useRef('');
  const busy = phase !== 'idle';
  const refused = error !== null || fieldError !== null;

  const submit = useCallback(
    (value: string) => {
      if (submitted.current === value && !refused) return;
      submitted.current = value;
      onSubmit(value);
    },
    [onSubmit, refused],
  );

  useEffect(() => {
    if (resendBlockedSeconds !== null) setCooldown(resendBlockedSeconds);
  }, [resendBlockedSeconds, setCooldown]);

  useEffect(() => {
    if (busy || code.length !== AUTH_CODE_LENGTH || submitted.current === code) return;
    submit(code);
  }, [busy, code, submit]);

  return (
    <AuthStepFrame
      heading={copy.text(text.heading.key, text.heading.label)}
      detail={
        <div className={AUTH_DETAIL_ROW_CLASS}>
          <span>{copy.text(text.sentTo.key, text.sentTo.label, { email })}</span>
          {onEditEmail ? (
            <button
              type="button"
              className={AUTH_BESIDE_TEXT_BUTTON_CLASS}
              disabled={busy}
              onClick={onEditEmail}
            >
              {copy.text('flow.edit', 'Edit')}
            </button>
          ) : null}
        </div>
      }
      footer={footer ?? <AuthLegalFooter />}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(code);
        }}
      >
        <AuthField
          label={copy.text('flow.code.label', 'Code')}
          type="text"
          name="code"
          inputMode="numeric"
          pattern={NUMERIC_PATTERN}
          autoComplete="one-time-code"
          sensitive="readable"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus
          required
          maxLength={AUTH_CODE_LENGTH}
          value={code}
          error={fieldError}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.value.replace(DIGITS_ONLY, '').slice(0, AUTH_CODE_LENGTH);
            if (next !== code) submitted.current = '';
            setCode(next);
          }}
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
            submitted.current = '';
            setCode('');
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
