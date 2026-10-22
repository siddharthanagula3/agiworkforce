'use client';

import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';

import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';

import { AuthAgeField } from './AuthAgeField';
import { useAuthCopy } from './authCopy';
import {
  AUTH_AGE_CONFIRMATION_CLASS,
  AUTH_FIELD_AID_CLASS,
  AUTH_FIELD_AID_LINK_CLASS,
} from './authStyles';
import type { SignupAgeGate } from './useSignupAgeGate';

const TERMS_ELIGIBILITY_HREF = `${CANONICAL_POLICY_ROUTES.terms}#s-02`;

export function AuthAgeConfirmation({
  gate,
  disabled,
}: {
  gate: SignupAgeGate;
  disabled: boolean;
}) {
  const copy = useAuthCopy();
  const headingId = useId();
  const focusedOnReady = useRef(false);
  const { fieldRef } = gate;

  useEffect(() => {
    if (disabled || focusedOnReady.current) return;
    focusedOnReady.current = true;
    const active = document.activeElement;
    if (active === null || active === document.body) fieldRef.current?.focus();
  }, [disabled, fieldRef]);

  return (
    <div role="group" aria-labelledby={headingId} className={AUTH_AGE_CONFIRMATION_CLASS}>
      <h2
        id={headingId}
        className="mb-3 text-[1.0625rem] font-semibold leading-snug text-text-primary"
      >
        {copy.text('flow.age.heading', 'Confirm your age')}
      </h2>
      <AuthAgeField gate={gate} disabled={disabled} />
      <div className={AUTH_FIELD_AID_CLASS}>
        <Link href={TERMS_ELIGIBILITY_HREF} className={AUTH_FIELD_AID_LINK_CLASS}>
          {copy.text('flow.age.terms', 'Age requirements')}
        </Link>
      </div>
    </div>
  );
}
