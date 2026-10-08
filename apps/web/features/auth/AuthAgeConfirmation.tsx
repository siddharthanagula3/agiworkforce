'use client';

import Link from 'next/link';

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

  return (
    <div className={AUTH_AGE_CONFIRMATION_CLASS}>
      <AuthAgeField gate={gate} disabled={disabled} />
      <div className={AUTH_FIELD_AID_CLASS}>
        <Link href={TERMS_ELIGIBILITY_HREF} className={AUTH_FIELD_AID_LINK_CLASS}>
          {copy.text('flow.age.terms', 'Age requirements')}
        </Link>
      </div>
    </div>
  );
}
