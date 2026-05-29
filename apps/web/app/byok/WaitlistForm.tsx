'use client';

import { useState, type FormEvent } from 'react';
import { addCsrfHeaders } from '@/lib/client/csrf';

type WaitlistSource = 'byok' | 'sync' | 'billing' | 'other';

interface Props {
  source?: WaitlistSource;
  /** Label for the submit button */
  ctaLabel?: string;
}

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export function WaitlistForm({
  source = 'byok',
  ctaLabel = 'Join Cloud Managed waitlist →',
}: Props) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState('submitting');
    setErrorMsg('');

    try {
      const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/waitlist/cloud-managed', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: email.trim().toLowerCase(), source }),
      });

      if (res.ok) {
        setState('success');
        setEmail('');
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMsg(data.error ?? 'Something went wrong. Please try again.');
        setState('error');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
      setState('error');
    }
  }

  if (state === 'success') {
    return (
      <p
        style={{
          fontSize: 14,
          color: 'var(--teal, #2eb88a)',
          padding: '10px 0',
          margin: 0,
        }}
      >
        You are on the list. We will email you when Cloud Managed private beta opens.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 220px' }}>
        <input
          type="email"
          required
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={state === 'submitting'}
          style={{
            padding: '8px 12px',
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md, 6px)',
            color: 'var(--text-1)',
            fontSize: 14,
            width: '100%',
            boxSizing: 'border-box',
          }}
        />
        {state === 'error' && errorMsg && (
          <span style={{ fontSize: 12, color: 'var(--agi-error)' }}>{errorMsg}</span>
        )}
      </div>

      <button
        type="submit"
        disabled={state === 'submitting'}
        style={{
          padding: '8px 16px',
          background: 'var(--agi-button-bg)',
          border: 'none',
          borderRadius: 'var(--radius-md, 6px)',
          color: 'var(--agi-button-ink)',
          fontSize: 14,
          fontWeight: 600,
          cursor: state === 'submitting' ? 'wait' : 'pointer',
          whiteSpace: 'nowrap',
          opacity: state === 'submitting' ? 0.7 : 1,
        }}
      >
        {state === 'submitting' ? 'Joining...' : ctaLabel}
      </button>
    </form>
  );
}
