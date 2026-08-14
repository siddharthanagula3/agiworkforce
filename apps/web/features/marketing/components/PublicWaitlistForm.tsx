'use client';

import { useId, useState, type FormEvent } from 'react';
import { joinPublicWaitlist } from '@/lib/services/waitlistServiceClient';
import { WAITLIST_CONSENT_PURPOSES } from '@/lib/consent-purposes';
import {
  ConsentCheckboxes,
  missingRequiredConsents,
  toConsentDecisions,
} from './ConsentCheckboxes';
import type { WaitlistModalSource } from './WaitlistModal';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormState = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Inline anonymous waitlist form for the /waitlist page (and any page that
 * wants an embedded form instead of the modal). Calls /api/waitlist/public ·
 * no account required; the server attaches the Clerk user id when a session
 * exists.
 *
 * The consent block is not decoration. DPDP s.6 makes the address storable only
 * against a purpose the person affirmatively agreed to, so the ticked set below
 * starts EMPTY and both the ticked and the unticked purposes are sent. The
 * server refuses the write when the required purpose is absent or false, which
 * means removing these checkboxes breaks the endpoint rather than silently
 * reverting to unconsented collection.
 */
export function PublicWaitlistForm({
  source = 'website',
  ctaLabel = 'Join Waitlist',
  successMessage = "You're on the list. We'll email you when the Enterprise program opens for your requirements.",
}: {
  source?: WaitlistModalSource;
  ctaLabel?: string;
  successMessage?: string;
}) {
  const emailId = useId();
  const errorId = useId();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  // Starts empty and is never seeded: an unticked box is the initial state, and
  // a ticked one can only come from a click.
  const [consented, setConsented] = useState<string[]>([]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === 'submitting') return;

    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setErrorMsg('Enter a valid email address.');
      setState('error');
      return;
    }

    const missing = missingRequiredConsents(WAITLIST_CONSENT_PURPOSES, consented);
    if (missing.length > 0) {
      setErrorMsg('Tick the box agreeing to your email being stored before joining.');
      setState('error');
      return;
    }

    setState('submitting');
    setErrorMsg('');

    const result = await joinPublicWaitlist({
      email: normalized,
      referralSource: source,
      consent: toConsentDecisions(WAITLIST_CONSENT_PURPOSES, consented),
      consentSurface: 'web-waitlist-inline',
    });
    if (result.success) {
      setState('success');
      setEmail('');
      setConsented([]);
    } else {
      setErrorMsg(result.error ?? 'Something went wrong. Please try again.');
      setState('error');
    }
  }

  if (state === 'success') {
    return (
      <p className="agi-waitlist-inline-success" role="status">
        {successMessage}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="agi-waitlist-inline">
      <label htmlFor={emailId} className="sr-only">
        Email address
      </label>
      <input
        id={emailId}
        name="email"
        type="email"
        autoComplete="email"
        spellCheck={false}
        required
        placeholder="you@company.com…"
        value={email}
        disabled={state === 'submitting'}
        aria-invalid={state === 'error'}
        aria-describedby={state === 'error' && errorMsg ? errorId : undefined}
        className="agi-waitlist-inline-input"
        onChange={(e) => {
          setEmail(e.target.value);
          if (state === 'error') {
            setState('idle');
            setErrorMsg('');
          }
        }}
      />
      <ConsentCheckboxes
        purposes={WAITLIST_CONSENT_PURPOSES}
        value={consented}
        disabled={state === 'submitting'}
        onChange={(next) => {
          setConsented(next);
          if (state === 'error') {
            setState('idle');
            setErrorMsg('');
          }
        }}
      />
      <button
        type="submit"
        className="agi-waitlist-inline-submit"
        disabled={state === 'submitting'}
      >
        {state === 'submitting' ? 'Joining…' : ctaLabel}
      </button>
      {state === 'error' && errorMsg ? (
        <p id={errorId} role="alert" aria-live="polite" className="agi-waitlist-inline-error">
          {errorMsg}
        </p>
      ) : null}
    </form>
  );
}
