import Link from 'next/link';

import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import {
  AUTH_FOOTER_CLASS,
  AUTH_FOOTER_LINK_CLASS,
  AUTH_FOOTER_SENTENCE_CLASS,
} from './authStyles';

const SIGNUP_AGREEMENT_LEAD = 'By signing up, you agree to the';
const SIGNUP_AGREEMENT_JOIN = 'and acknowledge the';

export function AuthLegalFooter({ variant = 'links' }: { variant?: 'links' | 'signup' }) {
  if (variant === 'signup') {
    return (
      <p className={AUTH_FOOTER_SENTENCE_CLASS} data-testid="auth-legal-footer">
        {SIGNUP_AGREEMENT_LEAD}{' '}
        <Link href={CANONICAL_POLICY_ROUTES.terms} className={AUTH_FOOTER_LINK_CLASS}>
          Terms of Use
        </Link>{' '}
        {SIGNUP_AGREEMENT_JOIN}{' '}
        <Link href={CANONICAL_POLICY_ROUTES.privacy} className={AUTH_FOOTER_LINK_CLASS}>
          Privacy Policy
        </Link>
        .
      </p>
    );
  }
  return (
    <div className={AUTH_FOOTER_CLASS} data-testid="auth-legal-footer">
      <Link href={CANONICAL_POLICY_ROUTES.terms} className={AUTH_FOOTER_LINK_CLASS}>
        Terms of Use
      </Link>
      <span aria-hidden="true">|</span>
      <Link href={CANONICAL_POLICY_ROUTES.privacy} className={AUTH_FOOTER_LINK_CLASS}>
        Privacy Policy
      </Link>
    </div>
  );
}
