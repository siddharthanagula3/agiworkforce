'use client';

import Link from 'next/link';
import { Fragment } from 'react';

import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { useAuthCopy } from './authCopy';
import { AUTH_FOOTER_BAR_CLASS, AUTH_FOOTER_CLASS, AUTH_FOOTER_NAV_LINK_CLASS } from './authStyles';

const HELP_HREF = '/help';
const CONTACT_HREF = '/contact';

const LINKS: ReadonlyArray<{ href: string; key: string; label: string }> = [
  { href: HELP_HREF, key: 'flow.legal.help', label: 'Help' },
  { href: CANONICAL_POLICY_ROUTES.privacy, key: 'flow.legal.privacyShort', label: 'Privacy' },
  { href: CANONICAL_POLICY_ROUTES.terms, key: 'flow.legal.termsShort', label: 'Terms' },
  { href: CONTACT_HREF, key: 'flow.legal.contact', label: 'Contact' },
];

export function AuthLegalFooter() {
  const copy = useAuthCopy();

  return (
    <div className={AUTH_FOOTER_CLASS} data-testid="auth-legal-footer">
      {LINKS.map((link, index) => (
        <Fragment key={link.href}>
          {index > 0 ? <span aria-hidden="true" className={AUTH_FOOTER_BAR_CLASS} /> : null}
          <Link href={link.href} className={AUTH_FOOTER_NAV_LINK_CLASS}>
            {copy.text(link.key, link.label)}
          </Link>
        </Fragment>
      ))}
    </div>
  );
}
