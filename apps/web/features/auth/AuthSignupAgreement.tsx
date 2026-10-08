'use client';

import Link from 'next/link';

import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';

import { useAuthCopy } from './authCopy';
import { AUTH_AGREEMENT_CLASS, AUTH_LINK_CLASS } from './authStyles';

export function AuthSignupAgreement() {
  const copy = useAuthCopy();

  return (
    <p className={AUTH_AGREEMENT_CLASS} data-testid="auth-signup-agreement">
      {copy.text('flow.agreement.lead', 'By creating an account, you agree to the')}{' '}
      <Link href={CANONICAL_POLICY_ROUTES.terms} className={AUTH_LINK_CLASS}>
        {copy.text('flow.legal.terms', 'Terms of Use')}
      </Link>{' '}
      {copy.text('flow.legal.agreementJoin', 'and acknowledge the')}{' '}
      <Link href={CANONICAL_POLICY_ROUTES.privacy} className={AUTH_LINK_CLASS}>
        {copy.text('flow.legal.privacy', 'Privacy Policy')}
      </Link>
      .
    </p>
  );
}
