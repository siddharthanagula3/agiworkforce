'use client';

import Link from 'next/link';

import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { useAuthCopy } from './authCopy';
import {
  AUTH_FOOTER_CLASS,
  AUTH_FOOTER_LINK_CLASS,
  AUTH_FOOTER_SENTENCE_CLASS,
} from './authStyles';

const HELP_HREF = '/help';

export function AuthLegalFooter({ variant = 'links' }: { variant?: 'links' | 'signup' }) {
  const copy = useAuthCopy();
  const terms = copy.text('flow.legal.terms', 'Terms of Use');
  const privacy = copy.text('flow.legal.privacy', 'Privacy Policy');

  if (variant === 'signup') {
    return (
      <p className={AUTH_FOOTER_SENTENCE_CLASS} data-testid="auth-legal-footer">
        {copy.text('flow.legal.agreementLead', 'By signing up, you agree to the')}{' '}
        <Link href={CANONICAL_POLICY_ROUTES.terms} className={AUTH_FOOTER_LINK_CLASS}>
          {terms}
        </Link>{' '}
        {copy.text('flow.legal.agreementJoin', 'and acknowledge the')}{' '}
        <Link href={CANONICAL_POLICY_ROUTES.privacy} className={AUTH_FOOTER_LINK_CLASS}>
          {privacy}
        </Link>
        .
      </p>
    );
  }
  return (
    <div className={AUTH_FOOTER_CLASS} data-testid="auth-legal-footer">
      <Link href={CANONICAL_POLICY_ROUTES.terms} className={AUTH_FOOTER_LINK_CLASS}>
        {terms}
      </Link>
      <span aria-hidden="true">|</span>
      <Link href={CANONICAL_POLICY_ROUTES.privacy} className={AUTH_FOOTER_LINK_CLASS}>
        {privacy}
      </Link>
      <span aria-hidden="true">|</span>
      <Link href={HELP_HREF} className={AUTH_FOOTER_LINK_CLASS}>
        {copy.text('flow.legal.help', 'Help')}
      </Link>
    </div>
  );
}
