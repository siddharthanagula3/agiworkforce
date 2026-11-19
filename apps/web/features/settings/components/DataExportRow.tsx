'use client';

import { useLayoutEffect, useMemo, useState, type MouseEvent } from 'react';
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
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { usePreferenceOwner, usePreferenceView } from '../hooks/use-preference-owner';
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

async function readArchive(request: RequestAuthority): Promise<DataExportArchive | null> {
  const res = await request.fetch(MANAGED_CLOUD_DATA_EXPORT_ARCHIVES_PATH, { cache: 'no-store' });
  if (!res.ok) throw new Error('Export status unavailable');
  const body = DataExportArchiveResponseSchema.parse(await res.json());
  request.assertCurrent();
  return body.archive;
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

type ExportView = {
  generation: object;
  archive: DataExportArchive | null;
  requesting: boolean;
  requestError: string | null;
  uncertain: boolean;
  stalled: boolean;
  statusReadFailed: boolean;
};

export function DataExportRow() {
  const owner = usePreferenceOwner();
  const captureView = usePreferenceView(owner);
  const [state, setState] = useState<ExportView | null>(null);
  const lane = useMemo(() => {
    let generation: object | null = null;
    let viewCurrent = () => false;
    let snapshot: ExportView | null = null;
    let reading: RequestAuthority | null = null;
    let writing: RequestAuthority | null = null;
    let timer: number | null = null;
    let timerOwner: object | null = null;
    let delay = POLL_FIRST_DELAY_MS;
    let startedAt: number | null = null;
    const current = (captured: object | null) =>
      captured !== null && captured === generation && owner?.isCurrent() === true && viewCurrent();
    const publish = (captured: object, patch: Partial<ExportView>) => {
      if (!current(captured) || !snapshot) return;
      snapshot = { ...snapshot, ...patch, generation: captured };
      setState(snapshot);
    };
    const stopRead = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      timerOwner = null;
      reading?.retire();
      reading = null;
    };
    const schedule = (captured: object): void => {
      if (
        !current(captured) ||
        writing ||
        snapshot?.archive?.status !== 'preparing' ||
        snapshot.stalled
      )
        return;
      startedAt ??= Date.now();
      if (Date.now() - startedAt >= POLL_BUDGET_MS) {
        publish(captured, { stalled: true });
        return;
      }
      const scheduled = {};
      timerOwner = scheduled;
      timer = window.setTimeout(() => {
        if (!current(captured) || timerOwner !== scheduled) return;
        timer = null;
        timerOwner = null;
        delay = Math.min(delay * 2, POLL_MAX_DELAY_MS);
        if (document.visibilityState === 'hidden') schedule(captured);
        else void read(captured);
      }, delay);
    };
    const read = async (captured: object): Promise<void> => {
      if (!owner || !current(captured) || writing) return;
      stopRead();
      const request = createRequestAuthority(
        owner.session,
        () => current(captured) && reading === request,
      );
      reading = request;
      try {
        const archive = await readArchive(request);
        request.assertCurrent();
        publish(captured, { archive, statusReadFailed: false });
      } catch {
        if (request.isCurrent()) publish(captured, { statusReadFailed: true });
      } finally {
        const owned = request.isCurrent() && reading === request;
        if (reading === request) reading = null;
        request.retire();
        if (owned) schedule(captured);
      }
    };
    const admits = (view: ExportView | null): view is ExportView =>
      view !== null && view === snapshot && current(view.generation);
    return {
      displays: (view: ExportView | null) => admits(view),
      setup: () => {
        const captured = {};
        generation = captured;
        viewCurrent = captureView();
        delay = POLL_FIRST_DELAY_MS;
        startedAt = null;
        snapshot = {
          generation: captured,
          archive: null,
          requesting: false,
          requestError: null,
          uncertain: false,
          stalled: false,
          statusReadFailed: false,
        };
        setState(snapshot);
        void read(captured);
        return () => {
          if (generation !== captured) return;
          generation = null;
          snapshot = null;
          stopRead();
          writing?.retire();
          writing = null;
        };
      },
      restart: (view: ExportView | null) => {
        if (!admits(view) || writing) return;
        stopRead();
        delay = POLL_FIRST_DELAY_MS;
        startedAt = null;
        publish(view.generation, { stalled: false });
        if (view.uncertain) void read(view.generation);
        else schedule(view.generation);
      },
      export: async (view: ExportView | null) => {
        if (
          !owner ||
          !admits(view) ||
          writing ||
          view.uncertain ||
          view.archive?.status === 'preparing'
        )
          return;
        const captured = view.generation;
        let dispatched = false;
        const request = createRequestAuthority(
          owner.session,
          () => current(captured) && writing === request,
          () => {
            dispatched = true;
          },
        );
        writing = request;
        stopRead();
        publish(captured, { requesting: true, requestError: null, statusReadFailed: false });
        try {
          const headers = await addCsrfHeaders();
          request.assertCurrent();
          const response = await request.fetch(MANAGED_CLOUD_DATA_EXPORT_PATH, {
            method: 'POST',
            headers,
          });
          if (!response.ok) throw new Error('Export failed');
          const { archive } = DataExportArchiveResponseSchema.parse(await response.json());
          request.assertCurrent();
          if (!archive) throw new Error('Export failed');
          delay = POLL_FIRST_DELAY_MS;
          startedAt = null;
          publish(captured, { archive, stalled: false });
        } catch (error) {
          if (request.isCurrent())
            publish(
              captured,
              dispatched
                ? { uncertain: true }
                : {
                    requestError: toUserMessage(
                      error,
                      'Export could not be started. Please try again.',
                    ),
                  },
            );
        } finally {
          const owned = request.isCurrent() && writing === request;
          if (writing === request) writing = null;
          request.retire();
          if (owned) {
            publish(captured, { requesting: false });
            if (snapshot?.uncertain) void read(captured);
            else schedule(captured);
          }
        }
      },
      guardDownload: (view: ExportView | null, event: MouseEvent<HTMLAnchorElement>) => {
        if (!admits(view)) event.preventDefault();
      },
    };
  }, [owner, captureView]);

  useLayoutEffect(() => lane.setup(), [lane]);
  const displayed = lane.displays(state) ? state : null;
  const archive = displayed?.archive ?? null;
  const requesting = displayed?.requesting === true;
  const requestError = displayed?.requestError;
  const stalled = displayed?.stalled === true;
  const statusReadFailed = displayed?.statusReadFailed === true;
  const uncertain = displayed?.uncertain === true;
  const busy = requesting || archive?.status === 'preparing';
  const disabled = !displayed || busy || uncertain;
  const restartPolling = () => lane.restart(displayed);
  const handleExport = () => {
    void lane.export(displayed);
  };

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
            Download a copy of your account data and files.
          </div>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={disabled}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-4)',
            fontSize: 12,
            fontWeight: 600,
            color: disabled ? 'var(--text-3)' : 'var(--text-1)',
            background: 'transparent',
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-md)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {busy ? <Spinner size="sm" aria-hidden="true" /> : null}
          {busy ? 'Preparing…' : 'Export data'}
        </button>
      </div>

      {uncertain ? (
        <SaveStatusLine failed style={blockStyle}>
          We couldn&apos;t confirm whether your export was started. Any export shown below is the
          latest one we could find. Check again to refresh its status.{' '}
          <button type="button" onClick={restartPolling} style={linkStyle}>
            Check again
          </button>
        </SaveStatusLine>
      ) : null}

      {requestError ? (
        <SaveStatusLine failed style={blockStyle}>
          {requestError}
        </SaveStatusLine>
      ) : archive?.status === 'preparing' ? (
        <div role="status" style={blockStyle}>
          <p style={{ margin: 0 }}>{preparingMessage(archive)}</p>
          {statusReadFailed ? (
            <p style={{ margin: 'var(--space-2) 0 0' }}>
              We couldn&apos;t check on it just now. We&apos;ll keep trying.
            </p>
          ) : null}
          {stalled && !uncertain ? (
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
      ) : archive?.status === 'ready' && archive.volumes.length === 0 ? (
        <SaveStatusLine failed style={blockStyle}>
          {uncertain
            ? 'The latest export finished without any files to download.'
            : 'Your export finished without any files to download. Request a new export.'}
        </SaveStatusLine>
      ) : archive?.status === 'ready' && archive.expiresAt ? (
        <div role="status" style={blockStyle}>
          <p style={{ margin: 0 }}>Your export is ready.</p>
          <ul style={{ margin: 'var(--space-2) 0 0', paddingLeft: 'var(--space-5)' }}>
            {archive.volumes.map((volume) => (
              <li key={volume.volume}>
                <a
                  href={volume.downloadPath}
                  style={linkStyle}
                  onClick={(event) => lane.guardDownload(displayed, event)}
                  onAuxClick={(event) => lane.guardDownload(displayed, event)}
                >
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
          {uncertain
            ? 'The latest export could not be prepared.'
            : "We couldn't prepare your export. Try again."}
        </SaveStatusLine>
      ) : archive?.status === 'expired' ? (
        <p role="status" style={blockStyle}>
          {uncertain
            ? 'The download link for the latest export has expired.'
            : 'The download link for your last export has expired. Request a new export to get a fresh link.'}
        </p>
      ) : statusReadFailed ? (
        <SaveStatusLine failed style={blockStyle}>
          {uncertain
            ? "We couldn't refresh the current export status."
            : "We couldn't check for an earlier export. Reload this page to try again."}
        </SaveStatusLine>
      ) : null}
    </div>
  );
}
