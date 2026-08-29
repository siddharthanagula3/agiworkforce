'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

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
 * anyone arriving from a marketing CTA — and every crawler — got a blank frame
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
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-fl-hero agi-fl-hero--copy" aria-labelledby="agi-signed-out-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">{eyebrow}</p>
          <h1 id="agi-signed-out-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">{heading}</span>
          </h1>
          <p className="agi-fl-lede">{children}</p>
          <div className="agi-fl-cta-row">
            <Link href={signInHref} className="agi-fl-cta agi-fl-cta--primary">
              {signInLabel}
            </Link>
            {secondary && (
              <Link href={secondary.href} className="agi-fl-cta agi-fl-cta--secondary">
                {secondary.label}
              </Link>
            )}
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
