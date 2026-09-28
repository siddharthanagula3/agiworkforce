'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, ChevronRight, Square } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import { SHELL_TIMEOUT_MAX_MS } from '@agiworkforce/local-runtime-contract';
import {
  cancelLocalCommand,
  startLocalCommand,
  type LocalCommandRun,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { CODE_COPY, CODE_LIMITS } from '../code-surface';
import { LOCAL_CODE_COPY } from '../local-code';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;
const EXIT_CODE_OK = 0;
const MAX_ENTRY_OUTPUT = 200_000;

interface TerminalEntry {
  id: string;
  command: string;
  output: string;
  exitCode: number | null;
  failed: boolean;
  running: boolean;
}

export interface LocalTerminalProps {
  rootId: string;
  onCommandFinished: () => void;
}

export function LocalTerminal({ rootId, onCommandFinished }: LocalTerminalProps) {
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const run = useRef<LocalCommandRun | null>(null);
  const regionId = useId();
  const fieldId = useId();
  const endRef = useRef<HTMLDivElement>(null);
  const running = entries.some((entry) => entry.running);

  useEffect(() => {
    setEntries([]);
  }, [rootId]);

  useEffect(() => {
    const end = endRef.current;
    if (open && typeof end?.scrollIntoView === 'function') end.scrollIntoView({ block: 'nearest' });
  }, [entries, open]);

  const update = (id: string, patch: (entry: TerminalEntry) => Partial<TerminalEntry>) =>
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch(entry) } : entry)),
    );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const line = command.trim();
    if (!line || running) return;
    setCommand('');
    let started: LocalCommandRun;
    try {
      started = startLocalCommand(
        { rootId, command: line, timeoutMs: SHELL_TIMEOUT_MAX_MS },
        (output) =>
          update(started.runId, (entry) => ({
            output: `${entry.output}${output.text}`.slice(-MAX_ENTRY_OUTPUT),
          })),
      );
    } catch (cause: unknown) {
      setEntries((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          command: line,
          output: toUserMessage(cause, LOCAL_CODE_COPY.commandFailed),
          exitCode: null,
          failed: true,
          running: false,
        },
      ]);
      return;
    }
    run.current = started;
    setEntries((current) => [
      ...current,
      {
        id: started.runId,
        command: line,
        output: '',
        exitCode: null,
        failed: false,
        running: true,
      },
    ]);
    try {
      const result = await started.result;
      update(started.runId, () => ({
        exitCode: result.exitCode,
        failed: result.timedOut || result.exitCode !== EXIT_CODE_OK,
        running: false,
      }));
    } catch (cause: unknown) {
      update(started.runId, (entry) => ({
        output: `${entry.output}\n${toUserMessage(cause, LOCAL_CODE_COPY.commandFailed)}`,
        failed: true,
        running: false,
      }));
    } finally {
      run.current = null;
      onCommandFinished();
    }
  };

  const stop = () => {
    const current = run.current;
    if (current) void cancelLocalCommand(current.runId);
  };

  return (
    <div className={styles['terminalBlock']}>
      <button
        type="button"
        className={styles['activityRow']}
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles['activityChevron']}>
          {open ? (
            <ChevronDown size={GLYPH_SIZE} aria-hidden="true" />
          ) : (
            <ChevronRight size={GLYPH_SIZE} aria-hidden="true" />
          )}
        </span>
        <span>{CODE_COPY.terminal}</span>
      </button>

      {open && (
        <div id={regionId} className={styles['terminalBlock']}>
          <div className={styles['terminal']} aria-live="polite">
            {entries.length === 0 && (
              <p className={styles['terminalEmpty']}>{CODE_COPY.terminalEmpty}</p>
            )}
            {entries.map((entry) => (
              <div key={entry.id} className={styles['terminalEntry']}>
                <div className={styles['terminalCommand']}>
                  <span className={styles['terminalPrompt']}>$ </span>
                  {entry.command}
                </div>
                {entry.output && <pre className={styles['terminalOutput']}>{entry.output}</pre>}
                {entry.running ? (
                  <Spinner size="sm" aria-label={LOCAL_CODE_COPY.working} />
                ) : (
                  <div
                    className={`${styles['terminalExit']} ${entry.failed ? styles['terminalError'] : ''}`}
                  >
                    {entry.exitCode === null
                      ? LOCAL_CODE_COPY.commandStopped
                      : `exit ${entry.exitCode}`}
                  </div>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form className={styles['formField']} onSubmit={(event) => void submit(event)}>
            <label className={styles['formLabel']} htmlFor={fieldId}>
              {CODE_COPY.commandLabel}
            </label>
            <div className={styles['commitRow']}>
              <input
                id={fieldId}
                className={styles['textInput']}
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder={CODE_COPY.commandPlaceholder}
                maxLength={CODE_LIMITS.command}
                disabled={running}
              />
              {running ? (
                <button type="button" className={styles['secondaryButton']} onClick={stop}>
                  <Square size={GLYPH_SIZE} aria-hidden="true" />
                  <span>{LOCAL_CODE_COPY.stop}</span>
                </button>
              ) : (
                <button
                  type="submit"
                  className={styles['secondaryButton']}
                  disabled={!command.trim()}
                >
                  {CODE_COPY.commandRun}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
