'use client';

import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';

import { SessionExpiredActions } from './SessionExpiredActions';

export const SESSION_RECOVERY_STORAGE_KEY = 'agi.session-recovery-attempt';
export const SESSION_RECOVERY_WINDOW_MS = 30_000;
export const SESSION_RECOVERY_BUDGET_WINDOW_MS = 10 * 60_000;
export const SESSION_RECOVERY_BUDGET = 2;

interface RecoveryAttempt {
  path: string;
  at: number;
}

function readAttempts(raw: string | null): RecoveryAttempt[] {
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (entry): entry is RecoveryAttempt =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as RecoveryAttempt).path === 'string' &&
      Number.isFinite((entry as RecoveryAttempt).at),
  );
}

function claimRecoveryAttempt(path: string, now: number): boolean {
  try {
    const recent = readAttempts(window.sessionStorage.getItem(SESSION_RECOVERY_STORAGE_KEY)).filter(
      (attempt) => now - attempt.at < SESSION_RECOVERY_BUDGET_WINDOW_MS,
    );
    const tooSoon = recent.some((attempt) => now - attempt.at < SESSION_RECOVERY_WINDOW_MS);
    if (tooSoon || recent.length >= SESSION_RECOVERY_BUDGET) return false;
    window.sessionStorage.setItem(
      SESSION_RECOVERY_STORAGE_KEY,
      JSON.stringify([...recent, { path, at: now }]),
    );
    return true;
  } catch {
    return false;
  }
}

function SessionExpiredMessage({ returnPath }: { returnPath: string | null }) {
  return (
    <>
      <h1 className="agi-ds-h1">Your session expired.</h1>
      <SessionExpiredActions returnPath={returnPath} />
    </>
  );
}

// The token cookie goes stale on pages without the identity client, and only a
// full document load lets the proxy refresh it, so one such load is tried first.
export function SessionRecovery({ returnPath }: { returnPath: string | null }) {
  const [expired, setExpired] = useState(returnPath === null);
  const decided = useRef(false);

  useEffect(() => {
    if (returnPath === null || decided.current) return;
    decided.current = true;
    if (claimRecoveryAttempt(returnPath, Date.now())) window.location.replace(returnPath);
    else setExpired(true);
  }, [returnPath]);

  if (expired) return <SessionExpiredMessage returnPath={returnPath} />;

  return (
    <>
      <Spinner size="lg" aria-label="Restoring your session" />
      <noscript>
        <SessionExpiredMessage returnPath={returnPath} />
      </noscript>
    </>
  );
}
