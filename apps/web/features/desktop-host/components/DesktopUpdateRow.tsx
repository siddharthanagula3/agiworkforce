'use client';

import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';
import type { HostUpdateAvailability } from '@agiworkforce/local-runtime-contract';
import { toUserMessage } from '@/lib/user-error-message';
import { useDesktopHost } from '../lib/host';

const LABEL = 'App version';
const CHECK_LABEL = 'Check for updates';
const CHECKING_LABEL = 'Checking…';
const INSTALL_LABEL = 'Install';
const UP_TO_DATE = 'This is the latest version.';
const CHECK_FAILED = 'The update check did not complete.';

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '14px 0',
  borderBottom: '1px solid var(--settings-border)',
  flexWrap: 'wrap',
};

const labelStyle: CSSProperties = { fontSize: 14, color: 'var(--text-1)', margin: 0 };

const hintStyle: CSSProperties = { fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' };

const errorStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--settings-destructive-text)',
  margin: '2px 0 0',
};

const buttonStyle: CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 11px',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-1)',
  background: 'transparent',
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export function DesktopUpdateRow() {
  const host = useDesktopHost();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<HostUpdateAvailability | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCheck = useCallback(async () => {
    if (!host) return;
    setChecking(true);
    setError(null);
    try {
      setResult(await host.checkForUpdate());
    } catch (cause) {
      setResult(null);
      setError(toUserMessage(cause, CHECK_FAILED));
    } finally {
      setChecking(false);
    }
  }, [host]);

  if (!host) return null;

  const updateAvailable = result?.available === true;

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
        ) : updateAvailable ? (
          <p role="status" style={hintStyle}>
            {`Version ${result.version} is available.`}
          </p>
        ) : result ? (
          <p role="status" style={hintStyle}>
            {UP_TO_DATE}
          </p>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexShrink: 0, gap: 8 }}>
        <button
          type="button"
          style={buttonStyle}
          disabled={checking}
          onClick={() => void onCheck()}
        >
          {checking ? CHECKING_LABEL : CHECK_LABEL}
        </button>
        {updateAvailable ? (
          <button type="button" style={buttonStyle} onClick={() => void host.openUpdateInstaller()}>
            {INSTALL_LABEL}
          </button>
        ) : null}
      </div>
    </div>
  );
}
