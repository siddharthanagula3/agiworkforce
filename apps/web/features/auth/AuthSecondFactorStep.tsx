'use client';

import Link from 'next/link';
import { useState } from 'react';

import { CONTACT_SUBJECTS, contactMailto } from '@/lib/legal-constants';
import { useAuthCopy } from './authCopy';
import { AuthField } from './AuthField';
import { AuthLegalFooter } from './AuthLegalFooter';
import { AuthPhaseStatus } from './AuthPhaseStatus';
import { AuthStepFrame } from './AuthStepFrame';
import { AuthSubmitButton } from './AuthSubmitButton';
import {
  AUTH_ERROR_CLASS,
  AUTH_LINK_CLASS,
  AUTH_QUIET_BUTTON_CLASS,
  AUTH_STEP_LINKS_CLASS,
} from './authStyles';
import type { AuthPhase, AuthSecondFactor, AuthSecondFactorKind } from './authContract';

const DETAIL_DEFAULTS: Readonly<Record<AuthSecondFactorKind, { key: string; label: string }>> = {
  authenticator: {
    key: 'flow.factorDetail.authenticator',
    label: 'Enter the code from your authenticator app',
  },
  text_message: {
    key: 'flow.factorDetail.textMessage',
    label: 'Enter the code we sent by text message',
  },
  email: { key: 'flow.factorDetail.email', label: 'Enter the code we emailed you' },
  backup_code: { key: 'flow.factorDetail.backupCode', label: 'Enter one of your backup codes' },
};

const SWITCH_DEFAULTS: Readonly<Record<AuthSecondFactorKind, { key: string; label: string }>> = {
  authenticator: { key: 'flow.useFactor.authenticator', label: 'Use your authenticator app' },
  text_message: { key: 'flow.useFactor.textMessage', label: 'Text me a code instead' },
  email: { key: 'flow.useFactor.email', label: 'Email me a code instead' },
  backup_code: { key: 'flow.useFactor.backupCode', label: 'Use a backup code' },
};

export function AuthSecondFactorStep({
  factor,
  alternatives = [],
  phase,
  error,
  fieldError,
  onSubmit,
  onUseFactor,
  onEditEmail,
}: {
  factor: AuthSecondFactor;
  alternatives?: readonly AuthSecondFactor[];
  phase: AuthPhase;
  error: string | null;
  fieldError: string | null;
  onSubmit: (code: string) => void;
  onUseFactor?: (factor: AuthSecondFactor) => void;
  onEditEmail: () => void;
}) {
  const copy = useAuthCopy();
  const [code, setCode] = useState('');
  const busy = phase !== 'idle';
  const base = copy.text(DETAIL_DEFAULTS[factor.kind].key, DETAIL_DEFAULTS[factor.kind].label);
  const detail = factor.hint
    ? copy.text('flow.factorDetail.withHint', '{{detail}} to {{hint}}', {
        detail: base,
        hint: factor.hint,
      })
    : base;
  const hasBackupCode = alternatives.some((candidate) => candidate.kind === 'backup_code');

  return (
    <AuthStepFrame
      heading={copy.text('flow.secondFactor.heading', 'Confirm it is you')}
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
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
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

        <AuthSubmitButton label={copy.text('flow.continue', 'Continue')} busy={busy} />
      </form>

      <AuthPhaseStatus phase={phase} />

      <div className={AUTH_STEP_LINKS_CLASS}>
        {onUseFactor
          ? alternatives.map((candidate) => (
              <button
                key={candidate.kind}
                type="button"
                className={AUTH_QUIET_BUTTON_CLASS}
                disabled={busy}
                onClick={() => onUseFactor(candidate)}
              >
                {copy.text(
                  SWITCH_DEFAULTS[candidate.kind].key,
                  SWITCH_DEFAULTS[candidate.kind].label,
                )}
              </button>
            ))
          : null}

        {hasBackupCode ? null : (
          <Link href={contactMailto(CONTACT_SUBJECTS.appeal)} className={AUTH_LINK_CLASS}>
            {copy.text('flow.secondFactor.lostDevice', 'Lost the device with your codes?')}
          </Link>
        )}

        <button
          type="button"
          className={AUTH_QUIET_BUTTON_CLASS}
          disabled={busy}
          onClick={onEditEmail}
        >
          {copy.text('flow.useDifferentEmail', 'Use a different email')}
        </button>
      </div>
    </AuthStepFrame>
  );
}
