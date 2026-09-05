'use client';

import Link from 'next/link';
import { useSession } from '@/lib/identity/client';
import { usePathname } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { addCsrfHeaders, CsrfTokenError } from '@/lib/client/csrf';

type WaitlistSource = 'byok' | 'sync' | 'billing' | 'other';

interface Props {
  source?: WaitlistSource;
  ctaLabel?: string;
}

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export function WaitlistForm({ source = 'byok', ctaLabel = 'Request early access →' }: Props) {
  const emailId = useId();
  const errorId = useId();
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useSession();
  const loginHref = `/login?redirectTo=${encodeURIComponent(pathname || '/waitlist')}`;
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [authRequired, setAuthRequired] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState('submitting');
    setErrorMsg('');
    setAuthRequired(false);

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setErrorMsg('Enter a valid email address.');
      setState('error');
      return;
    }

    if (!isLoaded) {
      setErrorMsg('Checking sign-in status. Please try again.');
      setState('error');
      return;
    }

    if (!isSignedIn) {
      setErrorMsg('Sign in to save this early-access request.');
      setAuthRequired(true);
      setState('error');
      return;
    }

    try {
      const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/waitlist/cloud-managed', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: normalizedEmail, source }),
      });

      if (res.ok) {
        setState('success');
        setEmail('');
      } else if (res.status === 401) {
        setErrorMsg('Sign in to save this early-access request.');
        setAuthRequired(true);
        setState('error');
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMsg(data.error ?? 'Something went wrong. Please try again.');
        setState('error');
      }
    } catch (err) {
      if (err instanceof CsrfTokenError && err.status === 429) {
        setErrorMsg('Too many requests. Please wait a moment and try again.');
      } else {
        setErrorMsg('Network error. Please try again.');
      }
      setState('error');
    }
  }

  if (state === 'success') {
    return (
      <p
        style={{
          fontSize: 14,
          color: 'var(--agi-success)',
          padding: '10px 0',
          margin: 0,
        }}
      >
        Your request is saved. We will email you when this early-access program opens for your
        account.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 220px' }}>
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
          placeholder="you@example.com…"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === 'error') {
              setState('idle');
              setErrorMsg('');
              setAuthRequired(false);
            }
          }}
          disabled={state === 'submitting'}
          aria-invalid={state === 'error'}
          aria-describedby={state === 'error' && errorMsg ? errorId : undefined}
          style={{
            padding: '8px 12px',
            background: 'var(--bg-elev)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 'var(--radius-md, 6px)',
            color: 'var(--text-1)',
            fontSize: 14,
            width: '100%',
            boxSizing: 'border-box',
          }}
        />
        {state === 'error' && errorMsg && (
          <span
            id={errorId}
            role="alert"
            aria-live="polite"
            style={{ fontSize: 12, color: 'var(--agi-error)' }}
          >
            {errorMsg}{' '}
            {authRequired && (
              <Link
                href={loginHref}
                style={{ color: 'var(--text-1)', textDecoration: 'underline' }}
              >
                Sign in
              </Link>
            )}
          </span>
        )}
      </div>

      <button
        type="submit"
        disabled={state === 'submitting' || !isLoaded}
        style={{
          padding: '8px 16px',
          background: 'var(--agi-button-bg)',
          border: 'none',
          borderRadius: 'var(--radius-md, 6px)',
          color: 'var(--agi-button-ink)',
          fontSize: 14,
          fontWeight: 600,
          cursor: state === 'submitting' || !isLoaded ? 'wait' : 'pointer',
          whiteSpace: 'nowrap',
          opacity: state === 'submitting' || !isLoaded ? 0.7 : 1,
        }}
      >
        {state === 'submitting' ? 'Joining…' : !isLoaded ? 'Checking…' : ctaLabel}
      </button>
    </form>
  );
}
