'use client';

import { PageLink } from '@shared/components/layout/EmbeddedPage';

import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';

import { useAuthCopy } from './authCopy';
import { AUTH_AGREEMENT_CLASS, AUTH_LINK_CLASS } from './authStyles';

export function AuthSignupAgreement({ id }: { id?: string }) {
  const copy = useAuthCopy();

  return (
    <p id={id} className={AUTH_AGREEMENT_CLASS} data-testid="auth-signup-agreement">
      {copy.text('flow.agreement.continuingLead', 'By continuing, you agree to the')}{' '}
      <PageLink href={CANONICAL_POLICY_ROUTES.terms} className={AUTH_LINK_CLASS}>
        {copy.text('flow.legal.terms', 'Terms of Use')}
      </PageLink>{' '}
      {copy.text('flow.legal.agreementJoin', 'and acknowledge the')}{' '}
      <PageLink href={CANONICAL_POLICY_ROUTES.privacy} className={AUTH_LINK_CLASS}>
        {copy.text('flow.legal.privacy', 'Privacy Policy')}
      </PageLink>
      .
    </p>
  );
}
