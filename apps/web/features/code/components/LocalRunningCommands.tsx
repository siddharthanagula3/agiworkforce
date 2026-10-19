'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Square } from '@agiworkforce/icons';
import type { BackgroundCommandRun } from '@agiworkforce/local-runtime-contract';
import {
  cancelLocalCommand,
  openLocalPreview,
  readBackgroundActivity,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_CODE_COPY } from '../local-code';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;
const POLL_MS = 3000;
const MINUTE_MS = 60_000;

export interface LocalRunningCommandsProps {
  rootId: string;
  refreshKey: number;
  now?: () => number;
}

export function LocalRunningCommands({
  rootId,
  refreshKey,
  now = Date.now,
}: LocalRunningCommandsProps) {
  const [runs, setRuns] = useState<BackgroundCommandRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const activity = await readBackgroundActivity();
      setRuns(activity.commands.filter((run) => run.rootId === rootId));
      setError(null);
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.runningCommandsFailed));
    }
  }, [rootId]);

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
