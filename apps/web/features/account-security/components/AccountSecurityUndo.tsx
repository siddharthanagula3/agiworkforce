'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';

import {
  AUTH_ERROR_CLASS,
  AUTH_HINT_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
} from '@/features/auth/authStyles';
import { AUTH_LOGIN_PATH } from '@/features/auth/authRoutes';
import { turnOffFromEmailLink } from '../lib/account-security-client';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function readTokenFromLink(): string | null {
  let token = '';
  try {
    token = decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return null;
  }
  return token.length === 43 && TOKEN_PATTERN.test(token) ? token : null;
}

interface UndoAttempt {
  phase: 'confirming' | 'requesting' | 'settled';
  dispatched: boolean;
}

export function AccountSecurityUndo() {
  const capturedToken = useRef<string | null | undefined>(undefined);
  const capturedLocation = useRef<string | null>(null);
  const outcome = useRef<'idle' | 'dispatched' | 'confirmed'>('idle');
  const generation = useRef(0);
  const live = useRef(false);
  const retired = useRef(false);
  const attempt = useRef<UndoAttempt | null>(null);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [linkChanged, setLinkChanged] = useState(false);
  const { confirm, dialog } = useConfirmAction();

  useLayoutEffect(() => {
    generation.current += 1;
    live.current = true;
    if (capturedToken.current === undefined) {
      capturedLocation.current = window.location.pathname + window.location.search;
      capturedToken.current = readTokenFromLink();
      if (window.location.hash) {
        window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      }
    }
    setToken(capturedToken.current);
    const retire = () => {
      retired.current = true;
      generation.current += 1;
      attempt.current = null;
      setBusy(false);
      if (outcome.current === 'dispatched') setUncertain(true);
      setLinkChanged(true);
    };
    const retireHash = () => {
      if (window.location.pathname + window.location.search === capturedLocation.current && window.location.hash) {
        window.history.replaceState(window.history.state, '', capturedLocation.current);
      }
      retire();
    };
    window.addEventListener('hashchange', retireHash);
    window.addEventListener('popstate', retire);
    window.addEventListener('pagehide', retire);
    return () => {
      live.current = false;
      generation.current += 1;
      attempt.current = null;
      window.removeEventListener('hashchange', retireHash);
      window.removeEventListener('popstate', retire);
      window.removeEventListener('pagehide', retire);
    };
  }, []);

  const turnOff = useCallback(() => {
    if (!token || !live.current || retired.current || attempt.current || done || uncertain || window.location.hash || window.location.pathname + window.location.search !== capturedLocation.current) return;
    const owner = generation.current;
    const current: UndoAttempt = { phase: 'confirming', dispatched: false };
    attempt.current = current;
    const isCurrent = () => live.current && !retired.current && generation.current === owner &&
      attempt.current === current && window.location.hash === '' &&
      window.location.pathname + window.location.search === capturedLocation.current;
    setBusy(true);
    setError(null);
    confirm({
      title: 'Turn off Advanced Account Security?',
      description:
        'This turns off Advanced Account Security and permanently removes its recovery keys and the saved passkey and security-key registrations that existed when it was turned on. Those registrations cannot be restored by this action. Session sign-out and password protection are attempted, but account recovery may need further attention.',
      confirmLabel: 'Turn off and remove registrations',
      destructive: true,
      onCancel: () => {
        if (!isCurrent() || current.phase !== 'confirming') return;
        attempt.current = null;
        setBusy(false);
      },
      onConfirm: async () => {
        if (!isCurrent() || current.phase !== 'confirming') return;
        current.phase = 'requesting';
        try {
          await turnOffFromEmailLink(token, {
            isCurrent,
            onDispatch: () => { current.dispatched = true; outcome.current = 'dispatched'; },
          });
          if (isCurrent()) {
            outcome.current = 'confirmed';
            setDone(true);
          }
        } catch {
          if (!isCurrent()) return;
          if (current.dispatched) setUncertain(true);
          else setError('The request could not start. Try again.');
        } finally {
          if (isCurrent()) {
            current.phase = 'settled';
            if (!current.dispatched) attempt.current = null;
            setBusy(false);
          }
        }
      },
    });
  }, [token, confirm, done, uncertain]);

  if (done || uncertain) {
    return (
      <div>
        <p className={uncertain ? AUTH_ERROR_CLASS : AUTH_HINT_CLASS} role={uncertain ? 'alert' : 'status'}>
          {uncertain
            ? 'We could not confirm the outcome. This link may already have been used, and account recovery may be incomplete. Sign in to review your sign-in methods and active sessions. Do not retry this action here.'
            : 'Advanced Account Security was turned off. Review your sign-in methods and active sessions. Account recovery may need further attention.'}
        </p>
        <Link href={AUTH_LOGIN_PATH} className={AUTH_PRIMARY_BUTTON_CLASS}>Sign in</Link>
      </div>
    );
  }

  if (linkChanged) {
    return <p role="alert" className={AUTH_ERROR_CLASS}>This link changed. Close this page and open the intended link again from your email.</p>;
  }

  if (token === null) {
    return <p role="alert" className={AUTH_ERROR_CLASS}>This link is incomplete. Open it again from the email.</p>;
  }

  return (
    <div>
      {dialog}
      <button
        type="button"
        className={AUTH_PRIMARY_BUTTON_CLASS}
        disabled={busy || token === undefined}
        onClick={turnOff}
      >
        {busy ? <Spinner size="sm" /> : null}
        Turn off Advanced Account Security
      </button>
      {error ? <p role="alert" className={AUTH_ERROR_CLASS}>{error}</p> : null}
    </div>
  );
}
