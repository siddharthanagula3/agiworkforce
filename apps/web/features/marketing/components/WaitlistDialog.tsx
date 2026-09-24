'use client';

import { useId, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@agiworkforce/ui/dialog';
import { WAITLIST_CONSENT_PURPOSES } from '@/lib/consent-purposes';
import { joinPublicWaitlist } from '@/lib/services/waitlistServiceClient';
import {
  ConsentCheckboxes,
  missingRequiredConsents,
  toConsentDecisions,
} from './ConsentCheckboxes';
import { Eyebrow } from './system';
import type { WaitlistModalSource } from './WaitlistModal';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export function WaitlistDialog({
  source,
  onOpenChange,
}: {
  source: WaitlistModalSource;
  onOpenChange: (open: boolean) => void;
}) {
  const emailId = useId();
  const errorId = useId();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [consented, setConsented] = useState<string[]>([]);

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setState((previous) => (previous === 'success' ? 'idle' : previous));
      setErrorMsg('');
      setEmail('');
      setConsented([]);
    }
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      consentSurface: 'web-waitlist-modal',
    });

    if (result.success) {
      setState('success');
      setConsented([]);
      return;
    }

    setErrorMsg(result.error ?? 'Something went wrong. Please try again.');
    setState('error');
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        data-design="agi"
        className="agi-modal-scope agi-ds-waitlist-modal"
        closeLabel="Close waitlist dialog"
        hideCloseButton
      >
        {state === 'success' ? (
          <div className="agi-ds-waitlist-success" role="status">
            <span className="agi-ds-waitlist-success-mark" aria-hidden="true">
              ✓
            </span>
            <DialogTitle className="agi-ds-h3">You&rsquo;re on the list.</DialogTitle>
            <DialogDescription className="agi-ds-prose">
              A person will contact you to discuss contract-scoped Enterprise access for your
              requirements. Managed Cloud is already open by default, and current availability for
              Local and BYOK is listed on each surface page. Changed your mind? Record a withdrawal
              at{' '}
              <a href="/privacy/requests" className="agi-ds-link">
                /privacy/requests
              </a>{' '}
              - no account needed.
            </DialogDescription>
          </div>
        ) : (
          <>
            <Eyebrow>Enterprise · contract access</Eyebrow>
            <DialogTitle className="agi-ds-h3">Discuss Enterprise access</DialogTitle>
            <DialogDescription className="agi-ds-prose">
              Managed Cloud is open by default. Team pricing and current checkout availability are
              shown on Pricing. This list is for contract-scoped Enterprise requirements such as
              SSO, custom retention, and governance controls · no account required.
            </DialogDescription>

            <form onSubmit={handleSubmit} noValidate className="agi-ds-form-row">
              <label htmlFor={emailId} className="sr-only">
                Email address
              </label>
              <input
                id={emailId}
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                spellCheck={false}
                required
                placeholder="you@company.com…"
                value={email}
                disabled={state === 'submitting'}
                aria-invalid={state === 'error'}
                aria-describedby={state === 'error' && errorMsg ? errorId : undefined}
                className="agi-ds-input"
                onChange={(event) => {
                  setEmail(event.target.value);
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
                className="agi-ds-btn"
                data-variant="primary"
                disabled={state === 'submitting'}
              >
                {state === 'submitting' ? 'Joining…' : 'Join waitlist'}
              </button>
            </form>

            {state === 'error' && errorMsg ? (
              <p id={errorId} role="alert" aria-live="polite" className="agi-ds-form-error">
                {errorMsg}
              </p>
            ) : null}

            <p className="agi-ds-hint" style={{ marginTop: 'var(--space-4)' }}>
              One personal follow-up about your Enterprise requirements; nothing here mails this
              list automatically, so there is no unsubscribe link in a message to click. No
              marketing drip. To come off the list, record a withdrawal at{' '}
              <a href="/privacy/requests" className="agi-ds-link">
                /privacy/requests
              </a>
              . It needs no account, and a person removes your address.
            </p>
          </>
        )}
        <button
          type="button"
          aria-label="Close waitlist dialog"
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border/70 hover:bg-accent hover:text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          onClick={() => handleOpenChange(false)}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Close waitlist dialog</span>
        </button>
      </DialogContent>
    </Dialog>
  );
}
