'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';

import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { AUTH_PRIMARY_BUTTON_CLASS } from '@/features/auth/authStyles';

/**
 * localStorage, not sessionStorage.
 *
 * The marker has to survive the OAuth round trip, which sessionStorage does,
 * but it also has to survive the user closing the tab, which it does not. The
 * gate therefore reappeared on every new browser session for people who had
 * already accepted, including on /login, while the panel told them "Your
 * agreement is recorded with your account". It is: /login/complete checks
 * hasAcceptedCurrentTerms(userId) server-side and skips the prompt. This marker
 * only decides whether the pre-auth clickwrap is already satisfied, and keying
 * it to the policy version means a genuine terms update still re-prompts.
 */
export const TERMS_GATE_STORAGE_KEY = 'agi.terms-accepted-version';

export function clearTermsGateMarker(): void {
  try {
    window.localStorage.removeItem(TERMS_GATE_STORAGE_KEY);
  } catch {
    // Non-fatal: storage may be disabled.
  }
}

export function hasCurrentTermsGateMarker(): boolean {
  try {
    return window.localStorage.getItem(TERMS_GATE_STORAGE_KEY) === POLICY_LAST_UPDATED.terms;
  } catch {
    return false;
  }
}

export function TermsGate({
  children,
  blockedMessage = 'Accept the terms above to create an account. Local Mode stays free and needs no account.',
  restorePreAuthMarker = true,
  confirmationLabel,
}: {
  children: ReactNode;
  blockedMessage?: ReactNode;
  restorePreAuthMarker?: boolean;
  confirmationLabel?: string;
}) {
  const [accepted, setAccepted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const checkboxId = useId();

  useEffect(() => {
    if (restorePreAuthMarker && hasCurrentTermsGateMarker()) setAccepted(true);
    setHydrated(true);
  }, [restorePreAuthMarker]);

  const onToggle = (next: boolean) => {
    setAccepted(next);
    try {
      if (next) window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
      else window.localStorage.removeItem(TERMS_GATE_STORAGE_KEY);
    } catch {
      // Non-fatal: see above.
    }
  };

  return (
    <div className={confirmationLabel ? 'flex flex-col' : 'flex flex-col gap-5'}>
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <label
          htmlFor={checkboxId}
          className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-foreground"
        >
          <input
            id={checkboxId}
            type="checkbox"
            checked={accepted}
            disabled={!hydrated || confirmed}
            onChange={(event) => onToggle(event.target.checked)}
            className="auth-inline mt-1 h-4 w-4 shrink-0 accent-primary"
          />
          <span>
            I agree to the{' '}
            <Link
              href={CANONICAL_POLICY_ROUTES.terms}
              target="_blank"
              rel="noopener noreferrer"
              className="auth-inline rounded-compact underline underline-offset-2"
            >
              Terms of Service
            </Link>
            , including the arbitration clause and class-action waiver, and acknowledge the{' '}
            <Link
              href={CANONICAL_POLICY_ROUTES.privacy}
              target="_blank"
              rel="noopener noreferrer"
              className="auth-inline rounded-compact underline underline-offset-2"
            >
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        <p className="mt-3 ps-7 text-xs leading-relaxed text-muted-foreground">
          Version dated {POLICY_LAST_UPDATED.terms}. Your agreement is recorded with your account.
        </p>
      </div>

      {confirmationLabel && !confirmed ? (
        <button
          type="button"
          className={AUTH_PRIMARY_BUTTON_CLASS}
          disabled={!hydrated || !accepted}
          onClick={() => setConfirmed(true)}
        >
          {confirmationLabel}
        </button>
      ) : accepted ? (
        <div className={confirmationLabel ? 'mt-8' : undefined}>{children}</div>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="terms-gate-blocked" role="status">
          {blockedMessage}
        </p>
      )}
    </div>
  );
}
