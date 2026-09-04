'use client';

import type { ReactNode } from 'react';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { PageHero, type PageCta } from '@/features/marketing/components/pages/surfaces/shared';

export interface SignedOutSurfaceProps {
  /** Small label above the heading, e.g. "Skills". */
  eyebrow: string;
  heading: string;
  /** One paragraph saying what the surface is and why it needs an account. */
  children: ReactNode;
  /** Where to send the visitor to sign in, already encoded. */
  signInHref: string;
  signInLabel: string;
  secondary?: { href: string; label: string };
}

/**
 * A public, indexed route that happens to need an account.
 *
 * Several of these rendered `null` and pushed anonymous visitors to /login, so
 * anyone arriving from a marketing CTA, and every crawler, got a blank frame
 * and a redirect that never said what the page was. This says what the surface
 * is, why it needs sign-in, and offers the sign-in rather than performing it.
 */
export function SignedOutSurface({
  eyebrow,
  heading,
  children,
  signInHref,
  signInLabel,
  secondary,
}: SignedOutSurfaceProps) {
  const ctas: PageCta[] = [{ href: signInHref, label: signInLabel }];
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
      </main>
      <MarketingFooter />
    </div>
  );
}
