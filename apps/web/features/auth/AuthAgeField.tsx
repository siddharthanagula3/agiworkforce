'use client';

import { useId } from 'react';
import {
  ACCOUNT_AGE_FIELD_LABEL,
  ACCOUNT_AGE_REQUIREMENT_NOTICE,
  accountAgeRefusalMessage,
  type AccountAgeRefusal,
} from '@agiworkforce/types';

import { useAuthCopy } from './authCopy';
import { AuthField } from './AuthField';
import type { SignupAgeGate } from './useSignupAgeGate';

const REFUSAL_COPY_KEY: Readonly<Record<AccountAgeRefusal, string>> = {
  missing: 'flow.age.required',
  invalid: 'flow.age.required',
  too_young: 'flow.age.ineligible',
};

export function AuthAgeField({ gate, disabled }: { gate: SignupAgeGate; disabled: boolean }) {
  const copy = useAuthCopy();
  const noticeId = useId();
  const describesRule = gate.verdict !== 'eligible' && gate.refusedAs !== 'too_young';
  const refusalText = gate.refusedAs === null ? null : accountAgeRefusalMessage(gate.refusedAs);
  const refusal =
    gate.refusedAs === null || refusalText === null
      ? null
      : copy.text(REFUSAL_COPY_KEY[gate.refusedAs], refusalText);

  return (
    <div data-testid="auth-age-field">
      {/* No name: a nameless control is left out of every form submission, so the age cannot reach a server. */}
      <AuthField
        ref={gate.fieldRef}
        label={copy.text('flow.age.label', ACCOUNT_AGE_FIELD_LABEL)}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        autoComplete="off"
        aria-required
        aria-describedby={describesRule ? noticeId : undefined}
        value={gate.age}
        error={refusal}
        disabled={disabled}
        onChange={(event) => gate.enter(event.target.value)}
      />
      {describesRule ? (
        <p id={noticeId} className="sr-only">
          {copy.text('flow.age.notice', ACCOUNT_AGE_REQUIREMENT_NOTICE)}
        </p>
      ) : null}
    </div>
  );
}
