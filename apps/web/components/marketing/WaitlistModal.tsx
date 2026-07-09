'use client';

/**
 * Public waitlist modal for the marketing site.
 *
 * - `WaitlistModalProvider` mounts once (app/providers.tsx) and owns the
 *   dialog state, so any page or component can open the modal.
 * - `useWaitlistModal()` exposes `open(source?)` for client components.
 * - `WaitlistTrigger` is a drop-in CTA button for server-rendered marketing
 *   pages; it opens the modal and degrades to a /waitlist link when the
 *   provider is missing (e.g. isolated renders in tests).
 *
 * Signups POST to /api/waitlist/public (anonymous; stored in the Neon
 * `cloud_managed_waitlist` table) via joinPublicWaitlist.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@agiworkforce/ui';
import { joinPublicWaitlist } from '@/lib/services/waitlistServiceClient';

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

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      // Reset for the next visit, but keep success visible while closing.
      setState((prev) => (prev === 'success' ? 'idle' : prev));
      setErrorMsg('');
      setEmail('');
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

    setState('submitting');
    setErrorMsg('');

    const result = await joinPublicWaitlist({ email: normalized, referralSource: source });

    if (result.success) {
      setState('success');
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
      >
        {state === 'success' ? (
          <div className="agi-waitlist-success" role="status">
            <span className="agi-waitlist-success-mark" aria-hidden="true">
              ✓
            </span>
            <DialogTitle className="agi-waitlist-title">You&rsquo;re on the list.</DialogTitle>
            <DialogDescription className="agi-waitlist-lede">
              We&rsquo;ll email you the moment AGI Cloud access opens for your address. Until then,
              AGI Web, Local, and BYOK are ready today.
            </DialogDescription>
          </div>
        ) : (
          <>
            <p className="agi-waitlist-eyebrow">Team &amp; Enterprise · early access</p>
            <DialogTitle className="agi-waitlist-title">
              Request Team &amp; Enterprise access
            </DialogTitle>
            <DialogDescription className="agi-waitlist-lede">
              Managed cloud is already open in public alpha — sign in to start. This list is for
              Team &amp; Enterprise (org seats, SSO, admin controls). Leave your email and
              we&rsquo;ll reach out as those land · no account required.
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
              One email when access opens. No marketing drip, unsubscribe anytime.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Routes where the auto-prompt must never appear (app + auth + the
 * waitlist page itself, which already hosts the inline form). */
const AUTO_PROMPT_BLOCKLIST = [
  '/chat',
  '/chats',
  '/settings',
  '/billing',
  '/admin',
  '/login',
  '/signup',
  '/sign-in',
  '/sign-up',
  '/register',
  '/waitlist',
  '/verify',
  '/auth',
  '/device-auth',
  '/customize',
  '/projects',
  '/pricing',
];

const AUTO_PROMPT_KEY = 'agi-waitlist-auto-prompted';
const AUTO_PROMPT_DELAY_MS = 5000;

export function WaitlistModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState<WaitlistModalSource>('website');
  const pathname = usePathname();

  const open = useCallback((nextSource: WaitlistModalSource = 'website') => {
    setSource(nextSource);
    setIsOpen(true);
  }, []);

  // Greet new visitors with the Team & Enterprise early-access prompt once per
  // session: after a short delay, on marketing pages only, and never twice.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (AUTO_PROMPT_BLOCKLIST.some((p) => pathname?.startsWith(p))) return;
    let prompted = false;
    try {
      prompted = window.sessionStorage.getItem(AUTO_PROMPT_KEY) === '1';
    } catch {
      prompted = true; // storage unavailable: never nag
    }
    if (prompted) return;

    const timer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(AUTO_PROMPT_KEY, '1');
      } catch {
        /* ignore */
      }
      setSource('website');
      setIsOpen(true);
    }, AUTO_PROMPT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <WaitlistModalContext.Provider value={value}>
      {children}
      <WaitlistDialog isOpen={isOpen} source={source} onOpenChange={setIsOpen} />
    </WaitlistModalContext.Provider>
  );
}

/**
 * CTA button that opens the waitlist modal. Safe to embed from server
 * components. Falls back to navigating to /waitlist when no provider is
 * mounted so the action is never dead.
 */
export function WaitlistTrigger({
  label = 'Team & Enterprise access',
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
