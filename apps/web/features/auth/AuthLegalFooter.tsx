import Link from 'next/link';

import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { AUTH_FOOTER_CLASS, AUTH_FOOTER_LINK_CLASS } from './authStyles';

export function AuthLegalFooter() {
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
