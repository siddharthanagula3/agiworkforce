'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';

import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  AUTH_CHECKBOX_CLASS,
  AUTH_CHECK_NOTE_CLASS,
  AUTH_CHECK_ROW_CLASS,
  AUTH_OPTIONAL_CONSENT_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
} from '@/features/auth/authStyles';
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
  const noteId = useId();
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

      <label htmlFor={checkboxId} className={AUTH_CHECK_ROW_CLASS}>
        <input
          id={checkboxId}
          type="checkbox"
          checked={accepted}
          disabled={!hydrated || confirmed}
          aria-describedby={noteId}
          onChange={(event) => onToggle(event.target.checked)}
          className={AUTH_CHECKBOX_CLASS}
        />
        <span>
          I agree to the{' '}
          <Link
            href={CANONICAL_POLICY_ROUTES.terms}
            target="_blank"
            rel="noopener noreferrer"
            className="auth-inline rounded-compact text-text-primary underline underline-offset-4"
          >
            Terms of Service
          </Link>{' '}
          and acknowledge the{' '}
          <Link
            href={CANONICAL_POLICY_ROUTES.privacy}
            target="_blank"
            rel="noopener noreferrer"
            className="auth-inline rounded-compact text-text-primary underline underline-offset-4"
          >
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      <p id={noteId} className={AUTH_CHECK_NOTE_CLASS}>
        Terms include arbitration and a class-action waiver.
      </p>

      {offerMarketingEmail ? (
        <AuthMarketingEmailConsent
          choice={marketingEmail}
          disabled={!hydrated || confirmed}
          className={AUTH_OPTIONAL_CONSENT_CLASS}
          optionalTag
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
