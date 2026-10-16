'use client';

import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import {
  DATA_EXPORT_DOWNLOAD_HOURS,
  DataExportArchiveResponseSchema,
  MANAGED_CLOUD_DATA_EXPORT_ARCHIVES_PATH,
  MANAGED_CLOUD_DATA_EXPORT_PATH,
  type DataExportArchive,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { SaveStatusLine } from './SaveStatusLine';

const POLL_FIRST_DELAY_MS = 3_000;
const POLL_MAX_DELAY_MS = 60_000;
const POLL_BUDGET_MS = 30 * 60_000;

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function readArchive(): Promise<DataExportArchive | null> {
  const res = await fetch(MANAGED_CLOUD_DATA_EXPORT_ARCHIVES_PATH, { cache: 'no-store' });
  if (!res.ok) throw new Error('Export status unavailable');
  return DataExportArchiveResponseSchema.parse(await res.json()).archive;
}

function preparingMessage(archive: DataExportArchive): string {
  const lifetime = `The link works for ${DATA_EXPORT_DOWNLOAD_HOURS} hours once it is ready.`;
  return archive.delivery === 'email'
    ? `We're preparing your export. We'll email you a download link when it's ready, and it will also appear here. ${lifetime}`
    : `We're preparing your export. A download link will appear here when it's ready, so you can leave this page and come back. ${lifetime}`;
}

const blockStyle = {
  margin: 0,
  padding: '0 0 var(--space-4)',
  fontSize: 14,
  lineHeight: 1.5,
  color: 'var(--text-2)',
} as const;

const linkStyle = {
  color: 'var(--text-1)',
  fontWeight: 600,
  textDecoration: 'underline',
} as const;

export function DataExportRow() {
  const [archive, setArchive] = useState<DataExportArchive | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const [pollRound, setPollRound] = useState(0);
  const pollDelay = useRef(POLL_FIRST_DELAY_MS);
  const pollStartedAt = useRef<number | null>(null);

  const preparing = archive?.status === 'preparing';

  useEffect(() => {
    let cancelled = false;
    readArchive()
      .then((current) => {
        if (!cancelled) setArchive(current);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!preparing || stalled) return;
    pollStartedAt.current ??= Date.now();
    if (Date.now() - pollStartedAt.current >= POLL_BUDGET_MS) {
      setStalled(true);
      return;
    }
    let cancelled = false;
    const delay = pollDelay.current;
    const timer = window.setTimeout(() => {
      pollDelay.current = Math.min(delay * 2, POLL_MAX_DELAY_MS);
      if (document.visibilityState === 'hidden') {
        setPollRound((round) => round + 1);
        return;
      }
      readArchive()
        .then((current) => {
          if (!cancelled) setArchive(current);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setPollRound((round) => round + 1);
        });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [preparing, stalled, pollRound]);

  function restartPolling() {
    pollDelay.current = POLL_FIRST_DELAY_MS;
    pollStartedAt.current = null;
    setStalled(false);
    setPollRound((round) => round + 1);
  }

  async function handleExport() {
    setRequesting(true);
    setRequestError(null);
    try {
      const res = await fetch(MANAGED_CLOUD_DATA_EXPORT_PATH, {
        method: 'POST',
        headers: await addCsrfHeaders(),
      });
      if (!res.ok) throw new Error('Export failed');
      const { archive: requested } = DataExportArchiveResponseSchema.parse(await res.json());
      if (!requested) throw new Error('Export failed');
      restartPolling();
      setArchive(requested);
    } catch (err) {
      setRequestError(toUserMessage(err, 'Export failed. Please try again.'));
    } finally {
      setRequesting(false);
    }
  }

  const busy = requesting || preparing;

  return (
    <div id="export-data" style={{ borderBottom: '1px solid var(--settings-border)' }}>
      <div
        style={{
          padding: 'var(--space-4) 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>Export data</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
            Get a copy of your account data and the files you stored. When it is ready, you can
            download it here.
          </div>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={busy}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-4)',
            fontSize: 12,
            fontWeight: 600,
            color: busy ? 'var(--text-3)' : 'var(--text-1)',
            background: 'transparent',
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-md)',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {busy ? <Spinner size="sm" aria-hidden="true" /> : null}
          {busy ? 'Preparing…' : 'Export data'}
        </button>
      </div>

      {requestError ? (
        <SaveStatusLine failed style={blockStyle}>
          {requestError}
        </SaveStatusLine>
      ) : archive?.status === 'preparing' ? (
        <div role="status" style={blockStyle}>
          <p style={{ margin: 0 }}>{preparingMessage(archive)}</p>
          {stalled ? (
            <p style={{ margin: 'var(--space-2) 0 0' }}>
              This is taking longer than usual. It will still appear here when it is ready.{' '}
              <button
                type="button"
                onClick={restartPolling}
                style={{
                  ...linkStyle,
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  font: 'inherit',
                }}
              >
                Check again
              </button>
            </p>
          ) : null}
        </div>
      ) : archive?.status === 'ready' && archive.expiresAt ? (
        <div role="status" style={blockStyle}>
          <p style={{ margin: 0 }}>Your export is ready.</p>
          <ul style={{ margin: 'var(--space-2) 0 0', paddingLeft: 'var(--space-5)' }}>
            {archive.volumes.map((volume) => (
              <li key={volume.volume}>
                <a href={volume.downloadPath} style={linkStyle}>
                  {archive.volumes.length === 1
                    ? 'Download your export'
                    : `Download part ${volume.volume} of ${archive.volumes.length}`}
                </a>
              </li>
            ))}
          </ul>
          <p style={{ margin: 'var(--space-2) 0 0' }}>
            {archive.volumes.length === 1 ? 'The link works' : 'The links work'} until{' '}
            {formatDateTime(archive.expiresAt)}.
          </p>
        </div>
      ) : archive?.status === 'failed' ? (
        <SaveStatusLine failed style={blockStyle}>
          We couldn&apos;t prepare your export. Try again.
        </SaveStatusLine>
      ) : archive?.status === 'expired' ? (
        <p role="status" style={blockStyle}>
          The download link for your last export has expired. Request a new export to get a fresh
          link.
        </p>
      ) : null}
    </div>
  );
}
