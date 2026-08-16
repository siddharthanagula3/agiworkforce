'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';

import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';

export const TERMS_GATE_STORAGE_KEY = 'agi.terms-accepted-version';

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
  restorePreAuthMarker?: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const checkboxId = useId();

  useEffect(() => {
    if (restorePreAuthMarker) {
      try {
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
