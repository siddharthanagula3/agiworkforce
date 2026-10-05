'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';

import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { AUTH_OPTIONAL_CONSENT_CLASS, AUTH_PRIMARY_BUTTON_CLASS } from '@/features/auth/authStyles';
import { AccountDataDisclosure } from '@/features/auth/AccountDataDisclosure';
import { AuthAgeConfirmation } from '@/features/auth/AuthAgeConfirmation';
import { AuthMarketingEmailConsent } from '@/features/auth/AuthMarketingEmailConsent';
import {
  MarketingEmailGrantProvider,
  useMarketingEmailChoice,
} from '@/features/auth/marketingEmailChoice';

import {
  clearSignupAttemptMarkers,
  hasCurrentTermsGateMarker,
  writeSignupAttemptMarkers,
} from './signupAttemptMarkers';

export { TERMS_GATE_STORAGE_KEY } from './signupAttemptMarkers';

export function TermsGate({
  children,
  blockedMessage = 'Accept the terms above to create an account. Local Mode stays free and needs no account.',
  restorePreAuthMarker = true,
  confirmationLabel,
  confirmAge = false,
  offerMarketingEmail = false,
  optedOutBySignal = false,
}: {
  children: ReactNode;
  blockedMessage?: ReactNode;
  restorePreAuthMarker?: boolean;
  confirmationLabel?: string;
  confirmAge?: boolean;
  offerMarketingEmail?: boolean;
  optedOutBySignal?: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const marketingEmail = useMarketingEmailChoice(optedOutBySignal);
  const checkboxId = useId();
  const ready = accepted && (!confirmAge || ageConfirmed);
  const marketingEmailGrant =
    offerMarketingEmail && marketingEmail.wanted ? POLICY_LAST_UPDATED.privacy : null;

  useEffect(() => {
    if (restorePreAuthMarker && hasCurrentTermsGateMarker()) setAccepted(true);
    setHydrated(true);
  }, [restorePreAuthMarker]);

  const onToggle = (next: boolean) => {
    setAccepted(next);
    if (next) writeSignupAttemptMarkers({ marketingEmail: false });
    else clearSignupAttemptMarkers();
  };

  return (
    <div className={confirmationLabel ? 'flex flex-col' : 'flex flex-col gap-5'}>
      {confirmAge ? (
        <AuthAgeConfirmation
          confirmed={ageConfirmed}
          disabled={!hydrated || confirmed}
          onChange={setAgeConfirmed}
        />
      ) : null}

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
        <p className="mt-3 ps-7 text-sm leading-relaxed text-muted-foreground">
          Version dated {POLICY_LAST_UPDATED.terms}. Your agreement is recorded with your account.
        </p>
      </div>

      {offerMarketingEmail ? (
        <AuthMarketingEmailConsent
          choice={marketingEmail}
          disabled={!hydrated || confirmed}
          className={`mt-2 ${AUTH_OPTIONAL_CONSENT_CLASS}`}
        />
      ) : null}

      <AccountDataDisclosure />

      {confirmationLabel && !confirmed ? (
        <button
          type="button"
          className={AUTH_PRIMARY_BUTTON_CLASS}
          disabled={!hydrated || !ready}
          onClick={() => setConfirmed(true)}
        >
          {confirmationLabel}
        </button>
      ) : ready ? (
        <div className={confirmationLabel ? 'mt-8' : undefined}>
          <MarketingEmailGrantProvider value={marketingEmailGrant}>
            {children}
          </MarketingEmailGrantProvider>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="terms-gate-blocked" role="status">
          {blockedMessage}
        </p>
      )}
    </div>
  );
}
