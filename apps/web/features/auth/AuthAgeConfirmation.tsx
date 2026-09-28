'use client';

import Link from 'next/link';
import { useId } from 'react';
import {
  ACCOUNT_AGE_CONFIRMATION_LABEL,
  ACCOUNT_AGE_REQUIREMENT_NOTICE,
} from '@agiworkforce/types';

import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';

import { useAuthCopy } from './authCopy';
import {
  AUTH_CHECKBOX_CLASS,
  AUTH_CHECK_ROW_CLASS,
  AUTH_HINT_CLASS,
  AUTH_LINK_CLASS,
} from './authStyles';

const TERMS_ELIGIBILITY_HREF = `${CANONICAL_POLICY_ROUTES.terms}#s-02`;

export function AuthAgeConfirmation({
  confirmed,
  disabled,
  onChange,
}: {
  confirmed: boolean;
  disabled: boolean;
  onChange: (confirmed: boolean) => void;
}) {
  const copy = useAuthCopy();
  const checkboxId = useId();
  const noticeId = useId();

  return (
    <div className="mb-6" data-testid="auth-age-confirmation">
      <label htmlFor={checkboxId} className={AUTH_CHECK_ROW_CLASS}>
        <input
          id={checkboxId}
          type="checkbox"
          checked={confirmed}
          disabled={disabled}
          aria-describedby={confirmed ? undefined : noticeId}
          onChange={(event) => onChange(event.target.checked)}
          className={AUTH_CHECKBOX_CLASS}
        />
        <span>{copy.text('flow.age.confirm', ACCOUNT_AGE_CONFIRMATION_LABEL)}</span>
      </label>
      {confirmed ? null : (
        <p id={noticeId} className={AUTH_HINT_CLASS}>
          {copy.text('flow.age.notice', ACCOUNT_AGE_REQUIREMENT_NOTICE)}{' '}
          <Link href={TERMS_ELIGIBILITY_HREF} className={AUTH_LINK_CLASS}>
            {copy.text('flow.age.terms', 'Terms of Use, section 2')}
          </Link>
        </p>
      )}
    </div>
  );
}
