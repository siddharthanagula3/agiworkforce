'use client';

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@agiworkforce/ui';
import { joinPublicWaitlist } from '@/lib/services/waitlistServiceClient';
import { WAITLIST_CONSENT_PURPOSES } from '@/lib/consent-purposes';
import {
  ConsentCheckboxes,
  missingRequiredConsents,
  toConsentDecisions,
} from './ConsentCheckboxes';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type WaitlistModalSource = 'website' | 'byok' | 'sync' | 'billing' | 'mobile' | 'other';

interface WaitlistModalContextValue {
  open: (source?: WaitlistModalSource) => void;
}

const WaitlistModalContext = createContext<WaitlistModalContextValue | null>(null);

export function useWaitlistModal(): WaitlistModalContextValue | null {
  return useContext(WaitlistModalContext);
}

type FormState = 'idle' | 'submitting' | 'success' | 'error';

function WaitlistDialog({
  isOpen,
  source,
  onOpenChange,
}: {
  isOpen: boolean;
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
      setState((prev) => (prev === 'success' ? 'idle' : prev));
      setErrorMsg('');
      setEmail('');
      setConsented([]);
    }
  };

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
      consentSurface: 'web-waitlist-modal',
    });

    if (result.success) {
      setState('success');
      setConsented([]);
    } else {
      setErrorMsg(result.error ?? 'Something went wrong. Please try again.');
      setState('error');
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-design="agi"
        className="agi-modal-scope agi-waitlist-modal"
        closeLabel="Close waitlist dialog"
        hideCloseButton
      >
        {state === 'success' ? (
          <div className="agi-waitlist-success" role="status">
            <span className="agi-waitlist-success-mark" aria-hidden="true">
              ✓
            </span>
            <DialogTitle className="agi-waitlist-title">You&rsquo;re on the list.</DialogTitle>
            <DialogDescription className="agi-waitlist-lede">
              We&rsquo;ll email you when the Enterprise program opens for your requirements. Managed
              Cloud is already open in public alpha, and current availability for Local and BYOK is
              listed on each surface page. Changed your mind? Record a withdrawal at{' '}
              <a href="/privacy/requests" className="agi-consent-notice-link">
                /privacy/requests
              </a>{' '}
              &mdash; no account needed.
            </DialogDescription>
          </div>
        ) : (
          <>
            <p className="agi-waitlist-eyebrow">Enterprise · early access</p>
            <DialogTitle className="agi-waitlist-title">Discuss Enterprise access</DialogTitle>
            <DialogDescription className="agi-waitlist-lede">
              Managed Cloud is open in public alpha. Team pricing and current checkout availability
              are shown on Pricing. This list is for contract-scoped Enterprise requirements such as
              SSO, custom retention, and governance controls · no account required.
            </DialogDescription>

            <form onSubmit={handleSubmit} noValidate className="agi-waitlist-form">
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
                className="agi-waitlist-input"
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
                className="agi-waitlist-submit"
                disabled={state === 'submitting'}
              >
                {state === 'submitting' ? 'Joining…' : 'Join waitlist'}
              </button>
            </form>

            {state === 'error' && errorMsg ? (
              <p id={errorId} role="alert" aria-live="polite" className="agi-waitlist-error">
                {errorMsg}
              </p>
            ) : null}

            <p className="agi-waitlist-finePrint">
              One email when access opens, sent by a person &mdash; nothing here mails this list
              automatically, so there is no unsubscribe link in a message to click. No marketing
              drip. To come off the list, record a withdrawal at{' '}
              <a href="/privacy/requests" className="agi-consent-notice-link">
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

export function WaitlistModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState<WaitlistModalSource>('website');

  const open = useCallback((nextSource: WaitlistModalSource = 'website') => {
    setSource(nextSource);
    setIsOpen(true);
  }, []);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <WaitlistModalContext.Provider value={value}>
      {children}
      <WaitlistDialog isOpen={isOpen} source={source} onOpenChange={setIsOpen} />
    </WaitlistModalContext.Provider>
  );
}

export function WaitlistTrigger({
  label = 'Enterprise early access',
  source = 'website',
  className,
}: {
  label?: string;
  source?: WaitlistModalSource;
  className?: string;
}) {
  const modal = useWaitlistModal();

  if (!modal) {
    return (
      <a href="/waitlist" className={className}>
        {label}
      </a>
    );
  }

  return (
    <button type="button" className={className} onClick={() => modal.open(source)}>
      {label}
    </button>
  );
}
