'use client';

import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';
import type { HostUpdateAvailability } from '@agiworkforce/local-runtime-contract';
import { toUserMessage } from '@/lib/user-error-message';
import { useDesktopHost } from '../lib/host';
import { installUpdate } from '../lib/update-install';

const LABEL = 'App version';
const CHECK_LABEL = 'Check for updates';
const CHECKING_LABEL = 'Checking…';
const INSTALL_LABEL = 'Download installer';
const RESTART_LABEL = 'Restart to update';
const UP_TO_DATE = 'This is the latest version.';
const CHECK_FAILED = 'The update check did not complete.';

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  padding: 'var(--space-4) 0',
  borderBottom: '1px solid var(--settings-border)',
  flexWrap: 'wrap',
};

const labelStyle: CSSProperties = { fontSize: 14, color: 'var(--text-1)', margin: 0 };

const hintStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-3)',
  margin: 'var(--space-1) 0 0',
};

const errorStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--settings-destructive-text)',
  margin: 'var(--space-1) 0 0',
};

const buttonStyle: CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-1)',
  background: 'transparent',
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

function formatCheckedAt(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function DesktopUpdateRow() {
  const host = useDesktopHost();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<HostUpdateAvailability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installStatus, setInstallStatus] = useState<string | null>(null);

  const onCheck = useCallback(async () => {
    if (!host) return;
    setChecking(true);
    setError(null);
    setInstallStatus(null);
    try {
      setResult(await host.checkForUpdate());
    } catch (cause) {
      setResult(null);
      setError(toUserMessage(cause, CHECK_FAILED));
    } finally {
      setChecking(false);
    }
  }, [host]);

  const onInstall = useCallback(
    async (restart: boolean) => {
      if (!host) return;
      setError(null);
      setInstallStatus(null);
      const feedback = await installUpdate(host, restart);
      if (feedback?.kind === 'error') setError(feedback.message);
      if (feedback?.kind === 'status') setInstallStatus(feedback.message);
    },
    [host],
  );

  if (!host) return null;

  const updateAvailable = result?.available === true;
  const readyToInstall = updateAvailable && result?.readyToInstall === true;
  const downloading =
    updateAvailable &&
    !readyToInstall &&
    (result?.downloading === true || result?.installsAutomatically === true);
  const lastChecked = result?.checkedAt ? formatCheckedAt(result.checkedAt) : null;

  return (
    <div style={rowStyle}>
      <div style={{ minWidth: 0 }}>
        <p style={labelStyle}>
          {LABEL}
          <span style={{ color: 'var(--text-3)' }}> · {host.appVersion}</span>
        </p>
        {error ? (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        ) : installStatus ? (
          <p role="status" style={hintStyle}>
            {installStatus}
          </p>
        ) : readyToInstall ? (
          <p role="status" style={hintStyle}>
            {`Version ${result?.version} is ready. Restart AGI Cloud to finish updating.`}
          </p>
        ) : downloading ? (
          <p role="status" style={hintStyle}>
            {`Version ${result?.version} is downloading. You will be told when it is ready.`}
          </p>
        ) : updateAvailable ? (
          <p role="status" style={hintStyle}>
            {`Version ${result.version} is available.`}
          </p>
        ) : result ? (
          <p role="status" style={hintStyle}>
            {UP_TO_DATE}
          </p>
        ) : null}
        {lastChecked ? <p style={hintStyle}>{`Last checked ${lastChecked}`}</p> : null}
      </div>
      <div style={{ display: 'flex', flexShrink: 0, gap: 'var(--space-2)' }}>
        <button
          type="button"
          style={buttonStyle}
          disabled={checking}
          onClick={() => void onCheck()}
        >
          {checking ? CHECKING_LABEL : CHECK_LABEL}
        </button>
        {updateAvailable && !downloading ? (
          <button
            type="button"
            style={buttonStyle}
            onClick={() => void onInstall(readyToInstall && host.restartToUpdate !== undefined)}
          >
            {readyToInstall ? RESTART_LABEL : INSTALL_LABEL}
          </button>
        ) : null}
      </div>
    </div>
  );
}
