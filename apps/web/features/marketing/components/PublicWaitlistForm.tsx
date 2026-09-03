'use client';

import { useId, useState, type FormEvent } from 'react';
import { joinPublicWaitlist } from '@/lib/services/waitlistServiceClient';
import { WAITLIST_CONSENT_PURPOSES, type ConsentPurpose } from '@/lib/consent-purposes';
import {
  ConsentCheckboxes,
  missingRequiredConsents,
  toConsentDecisions,
} from './ConsentCheckboxes';
import type { WaitlistModalSource } from './WaitlistModal';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export function PublicWaitlistForm({
  source = 'website',
  ctaLabel = 'Join Waitlist',
  successMessage = "You're on the list. We'll email you when the Enterprise program opens for your requirements.",
  purposes = WAITLIST_CONSENT_PURPOSES,
}: {
  source?: WaitlistModalSource;
  ctaLabel?: string;
  successMessage?: string;
  purposes?: readonly ConsentPurpose[];
}) {
  const emailId = useId();
  const errorId = useId();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
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

    const missing = missingRequiredConsents(purposes, consented);
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
      consent: toConsentDecisions(purposes, consented),
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
      <p className="agi-ds-form-success" role="status">
        {successMessage}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="agi-ds-form-row">
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
        className="agi-ds-input"
        style={{ flex: '1 1 240px' }}
        onChange={(e) => {
          setEmail(e.target.value);
          if (state === 'error') {
            setState('idle');
            setErrorMsg('');
          }
        }}
      />
      <ConsentCheckboxes
        purposes={purposes}
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
        className="agi-ds-btn"
        data-variant="primary"
        disabled={state === 'submitting'}
      >
        {state === 'submitting' ? 'Joining…' : ctaLabel}
      </button>
      {state === 'error' && errorMsg ? (
        <p id={errorId} role="alert" aria-live="polite" className="agi-ds-form-error">
          {errorMsg}
        </p>
      ) : null}
    </form>
  );
}
