'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Spinner } from '@agiworkforce/ui';

import {
  AUTH_ERROR_CLASS,
  AUTH_HINT_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
} from '@/features/auth/authStyles';
import { AUTH_LOGIN_PATH } from '@/features/auth/authRoutes';
import { toUserMessage } from '@/lib/user-error-message';
import type { AccountSecurityUndoResponse } from '@agiworkforce/cloud-contracts/account-security';
import { turnOffFromEmailLink } from '../lib/account-security-client';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function readTokenFromLink(): string | null {
  let token = '';
  try {
    token = decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return null;
  }
  return TOKEN_PATTERN.test(token) ? token : null;
}

export function AccountSecurityUndo() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<AccountSecurityUndoResponse | null>(null);

  useEffect(() => {
    setToken(readTokenFromLink());
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const turnOff = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await turnOffFromEmailLink(token));
    } catch (cause) {
      setError(toUserMessage(cause, 'Advanced Account Security could not be turned off.'));
    } finally {
      setBusy(false);
    }
  }, [token]);

  if (done) {
    return (
      <div>
        <p className={AUTH_HINT_CLASS} role="status">
          {done.passwordReset
            ? 'Advanced Account Security is off, every session and linked device was signed out, and your password was reset. On the sign-in screen, choose Forgot password? to set a new one.'
            : 'Advanced Account Security is off, and every session and linked device was signed out. Sign in and change your password now.'}
        </p>
        <Link href={AUTH_LOGIN_PATH} className={AUTH_PRIMARY_BUTTON_CLASS}>
          Sign in
        </Link>
      </div>
    );
  }

  if (token === null) {
    return (
      <p role="alert" className={AUTH_ERROR_CLASS}>
        This link is incomplete. Open it again from the email.
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        className={AUTH_PRIMARY_BUTTON_CLASS}
        disabled={busy || token === undefined}
        onClick={() => void turnOff()}
      >
        {busy ? <Spinner size="sm" /> : null}
        Turn it off and sign everyone out
      </button>
      {error ? (
        <p role="alert" className={AUTH_ERROR_CLASS}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
