'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

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
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
          {heading}
        </h1>
        <p className="max-w-prose text-[15px] leading-relaxed text-muted-foreground">{children}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={signInHref}
          className="inline-flex h-10 items-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {signInLabel}
        </Link>
        {secondary && (
          <Link
            href={secondary.href}
            className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {secondary.label}
          </Link>
        )}
      </div>
    </main>
  );
}
