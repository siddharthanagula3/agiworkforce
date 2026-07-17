'use client';

import { useId, useState, type FormEvent } from 'react';
import { joinPublicWaitlist } from '@/lib/services/waitlistServiceClient';
import type { WaitlistModalSource } from './WaitlistModal';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormState = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Inline anonymous waitlist form for the /waitlist page (and any page that
 * wants an embedded form instead of the modal). Calls /api/waitlist/public ·
 * no account required; the server attaches the Clerk user id when a session
 * exists.
 */
export function PublicWaitlistForm({
  source = 'website',
  ctaLabel = 'Join Waitlist',
  successMessage = "You're on the list. We'll email you when AGI Cloud access opens for your address.",
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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === 'submitting') return;

    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setErrorMsg('Enter a valid email address.');
      setState('error');
      return;
    }

    setState('submitting');
    setErrorMsg('');

    const result = await joinPublicWaitlist({ email: normalized, referralSource: source });
    if (result.success) {
      setState('success');
      setEmail('');
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
