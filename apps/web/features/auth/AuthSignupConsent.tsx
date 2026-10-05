'use client';

import Link from 'next/link';
import { useId } from 'react';
import {
  ACCOUNT_AGE_CONFIRMATION_LABEL,
  ACCOUNT_AGE_REQUIREMENT_NOTICE,
  ACCOUNT_SIGNUP_CONSENT_REQUIRED_MESSAGE,
} from '@agiworkforce/types';

import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';

import { useAuthCopy } from './authCopy';
import {
  AUTH_CHECK_ROW_CLASS,
  AUTH_CHECKBOX_CLASS,
  AUTH_CONSENT_CLASS,
  AUTH_CONSENT_MESSAGE_CLASS,
  AUTH_LINK_CLASS,
} from './authStyles';
import type { SignupConsentGate } from './useSignupConsentGate';

export function AuthSignupConsent({
  gate,
  disabled,
}: {
  gate: SignupConsentGate;
  disabled: boolean;
}) {
  const copy = useAuthCopy();
  const checkboxId = useId();
  const noticeId = useId();
  const messageId = useId();
  const described =
    [gate.refused ? messageId : null, gate.confirmed ? null : noticeId].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className={AUTH_CONSENT_CLASS} data-testid="auth-signup-consent">
      <label htmlFor={checkboxId} className={AUTH_CHECK_ROW_CLASS}>
        <input
          id={checkboxId}
          ref={gate.checkboxRef}
          type="checkbox"
          checked={gate.confirmed}
          disabled={disabled}
          aria-invalid={gate.refused || undefined}
          aria-describedby={described}
          onChange={(event) => gate.confirm(event.target.checked)}
          className={AUTH_CHECKBOX_CLASS}
        />
        <span>
          {copy.text('flow.age.confirm', ACCOUNT_AGE_CONFIRMATION_LABEL)},{' '}
          {copy.text('flow.consent.agree', 'agree to the')}{' '}
          <Link href={CANONICAL_POLICY_ROUTES.terms} className={AUTH_LINK_CLASS}>
            {copy.text('flow.legal.terms', 'Terms of Use')}
          </Link>
          , {copy.text('flow.legal.agreementJoin', 'and acknowledge the')}{' '}
          <Link href={CANONICAL_POLICY_ROUTES.privacy} className={AUTH_LINK_CLASS}>
            {copy.text('flow.legal.privacy', 'Privacy Policy')}
          </Link>
          .
        </span>
      </label>
      {gate.confirmed ? null : (
        <p id={noticeId} className="sr-only">
          {copy.text('flow.age.notice', ACCOUNT_AGE_REQUIREMENT_NOTICE)}
        </p>
      )}
      {gate.refused ? (
        <p id={messageId} role="alert" className={AUTH_CONSENT_MESSAGE_CLASS}>
          {copy.text('flow.consent.required', ACCOUNT_SIGNUP_CONSENT_REQUIRED_MESSAGE)}
        </p>
      ) : null}
    </div>
  );
}
