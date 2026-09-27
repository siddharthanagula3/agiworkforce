'use client';

import { useState } from 'react';
import { Eyebrow, Prose } from '@/features/marketing/components/system';

interface TrialSummary {
  plan: string;
  endsOn: string;
}

const NOT_CANCELLED = 'Your trial was not cancelled. Please try again.';

export function TrialCancelled({ plan, endsOn }: TrialSummary) {
  return (
    <>
      <div>
        <Eyebrow>Free trial</Eyebrow>
        <h1 className="agi-ds-h1">Your trial is cancelled.</h1>
      </div>
      <Prose>
        You will not be charged. {plan} stays on until {endsOn}, then your account moves to the Free
        plan.
      </Prose>
    </>
  );
}

export function TrialCancelControls({ token, plan, endsOn }: TrialSummary & { token: string }) {
  const [status, setStatus] = useState<'idle' | 'working' | 'cancelled'>('idle');
  const [error, setError] = useState('');

  async function cancelTrial() {
    setStatus('working');
    setError('');
    try {
      const response = await fetch('/api/trial/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ token }),
      });
      if (response.ok) {
        setStatus('cancelled');
        return;
      }
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: unknown };
      } | null;
      setError(typeof body?.error?.message === 'string' ? body.error.message : NOT_CANCELLED);
    } catch {
      setError('Your trial was not cancelled. Check your connection and try again.');
    }
    setStatus('idle');
  }

  if (status === 'cancelled') return <TrialCancelled plan={plan} endsOn={endsOn} />;

  return (
    <>
      <div>
        <Eyebrow>Free trial</Eyebrow>
        <h1 className="agi-ds-h1">Cancel your {plan} trial?</h1>
      </div>
      <Prose>
        Your free {plan} trial ends on {endsOn}. Cancel now and you will not be charged. {plan}{' '}
        stays on until then, and your account then moves to the Free plan.
      </Prose>
      {error ? (
        <p role="alert" className="agi-ds-form-error">
          {error}
        </p>
      ) : null}
      <div className="agi-ds-btn-row">
        <button
          type="button"
          className="agi-ds-btn"
          data-variant="primary"
          onClick={cancelTrial}
          disabled={status === 'working'}
        >
          {status === 'working' ? 'Cancelling…' : 'Cancel trial'}
        </button>
      </div>
    </>
  );
}
