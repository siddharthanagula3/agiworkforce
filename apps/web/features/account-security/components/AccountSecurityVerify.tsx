'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import {
  ACCOUNT_SECURITY_POLICY,
  ACCOUNT_SECURITY_SETTINGS_PATH,
  type AccountSecurityRecoveryHold,
} from '@agiworkforce/cloud-contracts/account-security';

import {
  AUTH_ERROR_CLASS,
  AUTH_HINT_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
  AUTH_PROVIDER_BUTTON_CLASS,
  AUTH_QUIET_BUTTON_CLASS,
  AUTH_STEP_LINKS_CLASS,
} from '@/features/auth/authStyles';
import { useElectronHost } from '@/features/desktop-host/lib/host';
import { isPasskeyCancellation } from '@features/settings/lib/passkey-cancellation';
import { useSignOut } from '@/lib/identity/client';
import { toUserMessage } from '@/lib/user-error-message';
import {
  canUseWebAuthn,
  completeDesktopHandoff,
  completeRecovery,
  fetchAccountSecurityStatus,
  readDesktopHandoffReturn,
  startDesktopHandoff,
  startRecovery,
  verifyWithPasskey,
  type PendingDesktopHandoff,
} from '../lib/account-security-client';

const HOLD_HOURS = ACCOUNT_SECURITY_POLICY.recoveryHoldHours;

function formatWhen(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function leave(target: string): void {
  window.location.replace(target);
}

export function AccountSecurityVerify({ redirectTo }: { redirectTo: string }) {
  const host = useElectronHost();
  const signOut = useSignOut();
  const [webAuthn, setWebAuthn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [hold, setHold] = useState<AccountSecurityRecoveryHold | null>(null);
  const [waitingOnBrowser, setWaitingOnBrowser] = useState(false);
  const pendingHandoff = useRef<PendingDesktopHandoff | null>(null);

  useEffect(() => {
    setWebAuthn(canUseWebAuthn());
    let cancelled = false;
    fetchAccountSecurityStatus()
      .then((status) => {
        if (cancelled) return;
        if (status.state === 'verification_required') {
          setHold(status.recovery);
          return;
        }
        leave(redirectTo);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [redirectTo]);

  useEffect(() => {
    if (!host) return;
    return host.onDeepLink((link) => {
      const returned = readDesktopHandoffReturn(link);
      const pending = pendingHandoff.current;
      if (!returned || !pending) return;
      pendingHandoff.current = null;
      setBusy(true);
      setError(null);
      completeDesktopHandoff({ ...returned, codeVerifier: pending.codeVerifier })
        .then(() => leave(redirectTo))
        .catch((cause: unknown) => {
          setWaitingOnBrowser(false);
          setError(toUserMessage(cause, 'This sign-in could not be confirmed. Try again.'));
        })
        .finally(() => setBusy(false));
    });
  }, [host, redirectTo]);

  const verifyHere = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyWithPasskey();
      leave(redirectTo);
    } catch (cause) {
      if (!isPasskeyCancellation(cause)) {
        setError(toUserMessage(cause, 'That passkey or security key could not be verified.'));
      }
    } finally {
      setBusy(false);
    }
  }, [redirectTo]);

  const verifyInBrowser = useCallback(async () => {
    if (!host) return;
    setBusy(true);
    setError(null);
    try {
      const pending = await startDesktopHandoff();
      pendingHandoff.current = pending;
      await host.openExternal(pending.url);
      setWaitingOnBrowser(true);
    } catch (cause) {
      pendingHandoff.current = null;
      setError(toUserMessage(cause, 'Your browser could not be opened. Try again.'));
    } finally {
      setBusy(false);
    }
  }, [host]);

  const beginRecovery = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setHold(await startRecovery(recoveryKey));
      setRecoveryKey('');
    } catch (cause) {
      setError(toUserMessage(cause, 'That recovery key could not be used.'));
    } finally {
      setBusy(false);
    }
  }, [recoveryKey]);

  const finishRecovery = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await completeRecovery();
      leave(ACCOUNT_SECURITY_SETTINGS_PATH);
    } catch (cause) {
      setError(toUserMessage(cause, 'Recovery could not be completed.'));
    } finally {
      setBusy(false);
    }
  }, []);

  const holdEnded = hold !== null && new Date(hold.unlocksAt).getTime() <= Date.now();
  const inWindow = webAuthn === true;

  if (hold) {
    return (
      <div>
        <p className={AUTH_HINT_CLASS}>
          {holdEnded
            ? 'The waiting period is over. Finish recovery, then add a new passkey or security key and replace your recovery keys.'
            : `Account recovery started on ${formatWhen(hold.startedAt)}. For your security, your account unlocks on ${formatWhen(hold.unlocksAt)}. Come back to this page on this device after then to finish.`}
        </p>
        {holdEnded ? (
          <button
            type="button"
            className={AUTH_PRIMARY_BUTTON_CLASS}
            disabled={busy}
            onClick={() => void finishRecovery()}
          >
            {busy ? <Spinner size="sm" /> : null}
            Finish recovery
          </button>
        ) : null}
        {error ? (
          <p role="alert" className={AUTH_ERROR_CLASS}>
            {error}
          </p>
        ) : null}
        <div className={AUTH_STEP_LINKS_CLASS}>
          <button
            type="button"
            className={AUTH_QUIET_BUTTON_CLASS}
            onClick={() => void signOut({ redirectUrl: '/login' })}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {waitingOnBrowser ? (
        <p className={AUTH_HINT_CLASS} role="status">
          Finish in your browser. This window continues on its own once you are verified.
        </p>
      ) : null}

      {inWindow ? (
        <button
          type="button"
          className={AUTH_PRIMARY_BUTTON_CLASS}
          disabled={busy}
          onClick={() => void verifyHere()}
        >
          {busy ? <Spinner size="sm" /> : null}
          Continue with passkey or security key
        </button>
      ) : null}

      {host ? (
        <button
          type="button"
          className={inWindow ? `${AUTH_PROVIDER_BUTTON_CLASS} mt-3` : AUTH_PRIMARY_BUTTON_CLASS}
          disabled={busy}
          onClick={() => void verifyInBrowser()}
        >
          {waitingOnBrowser ? 'Open the browser again' : 'Continue in your browser'}
        </button>
      ) : null}

      {webAuthn === false && !host ? (
        <p className={AUTH_HINT_CLASS}>
          This browser cannot use passkeys or security keys. Open this page in a browser that can,
          or use a recovery key.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className={AUTH_ERROR_CLASS}>
          {error}
        </p>
      ) : null}

      {recoveryOpen ? (
        <form
          className="mt-8"
          onSubmit={(event) => {
            event.preventDefault();
            void beginRecovery();
          }}
        >
          <label htmlFor="account-security-recovery-key" className={AUTH_LABEL_CLASS}>
            Recovery key
          </label>
          <input
            id="account-security-recovery-key"
            className={`${AUTH_INPUT_CLASS} mt-3 font-mono`}
            autoComplete="off"
            spellCheck={false}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            value={recoveryKey}
            disabled={busy}
            onChange={(event) => setRecoveryKey(event.target.value)}
          />
          <p className={AUTH_HINT_CLASS}>
            Each recovery key works once. Using one starts a {HOLD_HOURS}-hour wait before your
            account unlocks, and we email you about it.
          </p>
          <button
            type="submit"
            className={AUTH_PRIMARY_BUTTON_CLASS}
            disabled={busy || recoveryKey.trim().length === 0}
          >
            Start recovery
          </button>
        </form>
      ) : null}

      <div className={AUTH_STEP_LINKS_CLASS}>
        {recoveryOpen ? null : (
          <button
            type="button"
            className={AUTH_QUIET_BUTTON_CLASS}
            onClick={() => setRecoveryOpen(true)}
          >
            Lost your passkeys and security keys? Use a recovery key
          </button>
        )}
        <button
          type="button"
          className={AUTH_QUIET_BUTTON_CLASS}
          onClick={() => void signOut({ redirectUrl: '/login' })}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
