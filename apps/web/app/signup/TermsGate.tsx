'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';

import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';

/**
 * Clickwrap in front of account authentication and creation.
 *
 * The Clerk widget used to be the first thing on /signup, so an account —
 * including one created by a single OAuth click — could exist without the terms
 * ever having been on screen. An arbitration clause, a class-action waiver and
 * a liability cap only bind someone who agreed to them, so nothing this gate
 * wraps is rendered until the box is ticked.
 *
 * Scope, precisely: this blocks the Clerk cards on /login and /signup and the
 * recorders on their completion pages. It is a client-side gate, and the marker
 * below is client-writable, so it is not a security control — it is the surface
 * that puts the text on screen. The write that actually binds an account happens
 * after Clerk establishes an identity, which is why completion pages verify the
 * durable record rather than trusting the referrer.
 *
 * A pre-auth marker is mirrored into sessionStorage because OAuth leaves the
 * page and returns before Clerk finishes. It may restore the Clerk widget on
 * /login or /signup, but it never authorizes an account write: authenticated
 * completion gates ignore it and require a fresh click whenever the durable
 * account record is missing or outdated. Successful completion consumes it.
 */

export const TERMS_GATE_STORAGE_KEY = 'agi.terms-accepted-version';

/** Consume the pre-auth continuity marker once an authenticated flow finishes. */
export function clearTermsGateMarker(): void {
  try {
    window.sessionStorage.removeItem(TERMS_GATE_STORAGE_KEY);
  } catch {
    // Non-fatal: storage may be disabled.
  }
}

export function TermsGate({
  children,
  blockedMessage = 'Accept the terms above to create an account. Local Mode stays free and needs no account.',
  restorePreAuthMarker = true,
}: {
  children: ReactNode;
  blockedMessage?: ReactNode;
  /** OAuth continuity only. Completion gates must set this false. */
  restorePreAuthMarker?: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const checkboxId = useId();

  useEffect(() => {
    if (restorePreAuthMarker) {
      try {
        // Only promote to accepted. Never write `false` from this mount effect:
        // a fast user click can occur before effects flush, and resetting state
        // here leaves the native checkbox checked while the child stays blocked.
        if (window.sessionStorage.getItem(TERMS_GATE_STORAGE_KEY) === POLICY_LAST_UPDATED.terms) {
          setAccepted(true);
        }
      } catch {
        // Storage disabled (private mode, blocked cookies) — the gate still works,
        // it just cannot survive the OAuth round trip.
      }
    }
    setHydrated(true);
  }, [restorePreAuthMarker]);

  const onToggle = (next: boolean) => {
    setAccepted(next);
    try {
      if (next) window.sessionStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
      else window.sessionStorage.removeItem(TERMS_GATE_STORAGE_KEY);
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
            disabled={!hydrated}
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
            </Link>
            , including the arbitration clause and class-action waiver, and acknowledge the{' '}
            <Link
              href={CANONICAL_POLICY_ROUTES.privacy}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Privacy Policy
            </Link>
            .
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
