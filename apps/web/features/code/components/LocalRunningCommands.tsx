'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Square } from '@agiworkforce/icons';
import type { BackgroundCommandRun } from '@agiworkforce/local-runtime-contract';
import {
  cancelLocalCommand,
  openLocalPreview,
  readBackgroundActivity,
  readPreviewConsoleErrors,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_CODE_COPY, localPreviewErrorsMessage } from '../local-code';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;
const POLL_MS = 3000;
const MINUTE_MS = 60_000;

async function countPreviewErrors(): Promise<number> {
  try {
    const report = await readPreviewConsoleErrors(false);
    return report.errors.length + report.dropped;
  } catch {
    return 0;
  }
}

export interface LocalRunningCommandsProps {
  rootId: string;
  refreshKey: number;
  /** Absent where the session cannot take a turn, which leaves preview errors unsent. */
  onSendToAgent?: (message: string) => void;
  now?: () => number;
}

export function LocalRunningCommands({
  rootId,
  refreshKey,
  onSendToAgent,
  now = Date.now,
}: LocalRunningCommandsProps) {
  const [runs, setRuns] = useState<BackgroundCommandRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const activity = await readBackgroundActivity();
      const here = activity.commands.filter((run) => run.rootId === rootId);
      setRuns(here);
      setError(null);
      setErrorCount(
        onSendToAgent && here.some((run) => run.previewUrl) ? await countPreviewErrors() : 0,
      );
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.runningCommandsFailed));
    }
  }, [rootId, onSendToAgent]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load, refreshKey]);

  const preview = async (url: string) => {
    try {
      await openLocalPreview(url);
      setError(null);
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.previewFailed));
    }
  };

  const sendErrors = async () => {
    if (!onSendToAgent) return;
    try {
      const report = await readPreviewConsoleErrors(true);
      setErrorCount(0);
      if (report.errors.length === 0) return;
      onSendToAgent(localPreviewErrorsMessage(report));
      setError(null);
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.consoleErrorsFailed));
    }
  };

  const stop = async (runIds: string[]) => {
    setStopping((current) => new Set([...current, ...runIds]));
    try {
      await Promise.all(runIds.map((runId) => cancelLocalCommand(runId)));
    } finally {
      setStopping((current) => {
        const next = new Set(current);
        for (const runId of runIds) next.delete(runId);
        return next;
      });
      await load();
    }
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
            onClick={() => void stop(runs.map((run) => run.runId))}
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
      {onSendToAgent && errorCount > 0 && (
        <button
          type="button"
          className={styles['secondaryButton']}
          onClick={() => void sendErrors()}
        >
          {LOCAL_CODE_COPY.sendConsoleErrors(errorCount)}
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
            {run.previewUrl && (
              <button
                type="button"
                className={styles['secondaryButton']}
                aria-label={LOCAL_CODE_COPY.openPreviewOf(run.previewUrl)}
                title={run.previewUrl}
                onClick={() => run.previewUrl && void preview(run.previewUrl)}
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
              onClick={() => void stop([run.runId])}
            >
              <Square size={GLYPH_SIZE} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
