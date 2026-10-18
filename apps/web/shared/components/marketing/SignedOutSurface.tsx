'use client';

import type { ReactNode } from 'react';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { PageHero, type PageCta } from '@/features/marketing/components/pages/surfaces/shared';
import {
  CREATE_ACCOUNT_LABEL,
  webEntryHref,
  webSignInHref,
} from '@/features/marketing/components/system/nav';

export interface SignedOutSurfaceProps {
  /** Small label above the heading, e.g. "Skills". */
  eyebrow: string;
  heading: string;
  /** One paragraph saying what the surface is and why it needs an account. */
  children: ReactNode;
  redirectTo: string;
  signInLabel: string;
  secondary?: { href: string; label: string };
  after?: ReactNode;
}

/**
 * A public, indexed route that happens to need an account. It says what the
 * surface is, why it needs sign-in, and offers the sign-in rather than
 * performing it, so visitors and crawlers never get a blank redirect.
 */
export function SignedOutSurface({
  eyebrow,
  heading,
  children,
  redirectTo,
  signInLabel,
  secondary,
  after,
}: SignedOutSurfaceProps) {
  const ctas: PageCta[] = [
    { href: webSignInHref(redirectTo), label: signInLabel },
    { href: webEntryHref(redirectTo), label: CREATE_ACCOUNT_LABEL, variant: 'secondary' },
  ];
  if (secondary) {
    ctas.push({ href: secondary.href, label: secondary.label, variant: 'secondary' });
  }

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-signed-out-title"
          eyebrow={eyebrow}
          title={heading}
          lede={children}
          ctas={ctas}
        />
        {after}
      </main>
      <MarketingFooter />
    </div>
  );
}
