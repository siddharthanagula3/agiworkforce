'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';

import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';

/**
 * Clickwrap in front of account creation.
 *
 * The Clerk widget used to be the first thing on /signup, so an account —
 * including one created by a single OAuth click — could exist without the terms
 * ever having been on screen. An arbitration clause, a class-action waiver and
 * a liability cap only bind someone who agreed to them, so nothing this gate
 * wraps is rendered until the box is ticked.
 *
 * Scope, precisely: this blocks the Clerk sign-up card on /signup and the
 * recorder on /signup/complete. It is a client-side gate, and the marker below
 * is client-writable, so it is not a security control — it is the surface that
 * puts the text on screen and the evidence that it was. The write that actually
 * binds an account happens server-side from /signup/complete, which is why that
 * page is wrapped in this same gate rather than trusting the referrer.
 *
 * The assent is mirrored into sessionStorage under the accepted revision
 * because OAuth signup leaves the page and comes back, and because the record
 * is written a navigation later on /signup/complete. Without it the return trip
 * would remount this gate unchecked, unmount the widget mid-flow and strand the
 * user. Keying it on the revision means a /terms revision mid-session re-prompts
 * rather than silently inheriting consent to text that changed.
 */

const CONSENT_STORAGE_KEY = 'agi.terms-accepted-version';

export function TermsGate({
  children,
  blockedMessage = 'Accept the terms above to create an account. Local Mode stays free and needs no account.',
}: {
  children: ReactNode;
  blockedMessage?: ReactNode;
}) {
  const [accepted, setAccepted] = useState(false);
  const checkboxId = useId();

  useEffect(() => {
    try {
      setAccepted(window.sessionStorage.getItem(CONSENT_STORAGE_KEY) === POLICY_LAST_UPDATED.terms);
    } catch {
      // Storage disabled (private mode, blocked cookies) — the gate still works,
      // it just cannot survive the OAuth round trip.
    }
  }, []);

  const onToggle = (next: boolean) => {
    setAccepted(next);
    try {
      if (next) window.sessionStorage.setItem(CONSENT_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
      else window.sessionStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      // Non-fatal: see above.
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <label htmlFor={checkboxId} className="flex items-start gap-3 text-sm text-foreground">
          <input
            id={checkboxId}
            type="checkbox"
            checked={accepted}
            onChange={(event) => onToggle(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span>
            I agree to the{' '}
            <Link
              href={CANONICAL_POLICY_ROUTES.terms}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Terms of Service
            </Link>{' '}
            and the{' '}
            <Link
              href={CANONICAL_POLICY_ROUTES.privacy}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Privacy Policy
            </Link>
            , including the arbitration clause and class-action waiver.
          </span>
        </label>
        <p className="mt-2 pl-7 text-xs text-muted-foreground">
          Version dated {POLICY_LAST_UPDATED.terms}. Your agreement is recorded with your account.
        </p>
      </div>

      {accepted ? (
        children
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="terms-gate-blocked" role="status">
          {blockedMessage}
        </p>
      )}
    </div>
  );
}
