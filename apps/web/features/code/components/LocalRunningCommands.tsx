'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Square } from '@agiworkforce/icons';
import {
  localPreviewOrigin,
  type BackgroundCommandRun,
} from '@agiworkforce/local-runtime-contract';
import {
  cancelLocalCommand,
  readBackgroundActivity,
  readPreviewConsoleErrors,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_CODE_COPY, localPreviewErrorsMessage } from '../local-code';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;
const POLL_MS = 3000;
const MINUTE_MS = 60_000;

interface PreviewErrors {
  url: string;
  count: number;
}

async function previewErrorsOf(runs: BackgroundCommandRun[]): Promise<PreviewErrors | null> {
  const served = new Set(runs.flatMap((run) => localPreviewOrigin(run.previewUrl) ?? []));
  if (served.size === 0) return null;
  try {
    const report = await readPreviewConsoleErrors(false);
    const count = report.errors.length + report.dropped;
    if (report.url === null || count === 0) return null;
    const origin = localPreviewOrigin(report.url);
    return origin !== null && served.has(origin) ? { url: report.url, count } : null;
  } catch {
    return null;
  }
}

export interface LocalRunningCommandsProps {
  rootId: string;
  refreshKey: number;
  /** Absent where the session cannot take a turn, which leaves preview errors unsent. */
  onSendToAgent?: (message: string) => void;
  /** Absent where there is no browser pane to show a page in, which leaves Preview out. */
  onOpenPreview?: (url: string) => void;
  now?: () => number;
}

export function LocalRunningCommands({
  rootId,
  refreshKey,
  onSendToAgent,
  onOpenPreview,
  now = Date.now,
}: LocalRunningCommandsProps) {
  const [runs, setRuns] = useState<BackgroundCommandRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewErrors, setPreviewErrors] = useState<PreviewErrors | null>(null);
  const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());
  const [stopFailures, setStopFailures] = useState<ReadonlyMap<string, string>>(new Map());

  const load = useCallback(async () => {
    try {
      const activity = await readBackgroundActivity();
      const here = activity.commands.filter((run) => run.rootId === rootId);
      setRuns(here);
      setStopFailures((current) => {
        const listed = new Set(here.map((run) => run.runId));
        const next = new Map([...current].filter(([runId]) => listed.has(runId)));
        return next.size === current.size ? current : next;
      });
      setError(null);
      setPreviewErrors(onSendToAgent ? await previewErrorsOf(here) : null);
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.runningCommandsFailed));
    }
  }, [rootId, onSendToAgent]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load, refreshKey]);

  const sendErrors = async () => {
    if (!onSendToAgent || !previewErrors) return;
    try {
      const report = await readPreviewConsoleErrors(true, previewErrors.url);
      setPreviewErrors(null);
      if (report.errors.length === 0) return;
      onSendToAgent(localPreviewErrorsMessage(report));
      setError(null);
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.consoleErrorsFailed));
    }
  };

  const stop = async (targets: BackgroundCommandRun[]) => {
    const runIds = targets.map((target) => target.runId);
    setStopping((current) => new Set([...current, ...runIds]));
    setStopFailures((current) => {
      const next = new Map(current);
      for (const runId of runIds) next.delete(runId);
      return next;
    });
    const outcomes = await Promise.allSettled(
      targets.map((target) => cancelLocalCommand(target.runId)),
    );
    setStopping((current) => {
      const next = new Set(current);
      for (const runId of runIds) next.delete(runId);
      return next;
    });
    setStopFailures((current) => {
      const next = new Map(current);
      outcomes.forEach((outcome, index) => {
        const target = targets[index];
        if (outcome.status === 'rejected' && target) {
          next.set(target.runId, LOCAL_CODE_COPY.stopCommandFailed(target.command));
        }
      });
      return next;
    });
    await load();
  };

  if (runs.length === 0 && error === null) return null;

  return (
    <section className={styles['terminalBlock']} aria-label={LOCAL_CODE_COPY.runningCommands}>
      <div className={styles['changesHeader']}>
        <span className={styles['changesBranch']}>{LOCAL_CODE_COPY.runningCommands}</span>
        {runs.length > 1 && (
          <button
            type="button"
            className={styles['secondaryButton']}
            onClick={() => void stop(runs)}
          >
            {LOCAL_CODE_COPY.stopAllCommands}
          </button>
        )}
      </div>
      {error !== null && (
        <p className={styles['changesEmpty']} role="alert">
          {error}
        </p>
      )}
      {[...stopFailures].map(([runId, message]) => (
        <p key={runId} className={styles['changesEmpty']} role="alert">
          {message}
        </p>
      ))}
      {onSendToAgent && previewErrors && (
        <button
          type="button"
          className={styles['secondaryButton']}
          onClick={() => void sendErrors()}
        >
          {LOCAL_CODE_COPY.sendConsoleErrors(previewErrors.count)}
        </button>
      )}
      <ul className={styles['fileList']}>
        {runs.map((run) => (
          <li key={run.runId} className={styles['fileSelectRow']}>
            <span className={styles['fileRow']}>
              <span className={styles['fileName']} title={run.command}>
                {run.command}
              </span>
              <span className={styles['fileStatus']}>
                {LOCAL_CODE_COPY.runningSince(Math.floor((now() - run.startedAtMs) / MINUTE_MS))}
              </span>
            </span>
            {run.previewUrl && onOpenPreview && (
              <button
                type="button"
                className={styles['secondaryButton']}
                aria-label={LOCAL_CODE_COPY.openPreviewOf(run.previewUrl)}
                title={run.previewUrl}
                onClick={() => run.previewUrl && onOpenPreview(run.previewUrl)}
              >
                <ExternalLink size={GLYPH_SIZE} aria-hidden="true" />
                {LOCAL_CODE_COPY.openPreview}
              </button>
            )}
            <button
              type="button"
              className={styles['headerButton']}
              aria-label={LOCAL_CODE_COPY.stopCommand(run.command)}
              disabled={stopping.has(run.runId)}
              onClick={() => void stop([run])}
            >
              <Square size={GLYPH_SIZE} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
