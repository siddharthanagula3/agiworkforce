'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DesktopRuntimeError,
  SHELL_TIMEOUT_MAX_MS,
  type ShellRunResult,
} from '@agiworkforce/local-runtime-contract';
import {
  cancelLocalCommand,
  listWorkspaceFiles,
  readWorkspaceText,
  startLocalCommand,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_CODE_COPY, detectTestCommand } from '../local-code';

const PACKAGE_MANIFEST = 'package.json';

export type LocalTestsStatus = 'idle' | 'running' | 'passed' | 'failed' | 'unavailable';

export interface LocalTestsState {
  status: LocalTestsStatus;
  command: string | null;
  message: string | null;
  output: string;
  run: () => Promise<void>;
  stop: () => void;
}

function outcomeMessage(command: string, result: ShellRunResult): string {
  if (result.timedOut) return LOCAL_CODE_COPY.testsTimedOut(command);
  if (result.exitCode === 0) return LOCAL_CODE_COPY.testsPassed(command);
  return LOCAL_CODE_COPY.testsFailed(command, result.exitCode);
}

/**
 * Runs the folder's own test command through the desktop shell, which asks
 * before it runs and keeps the command inside the folder's sandbox.
 */
export function useLocalTests(rootId: string): LocalTestsState {
  const [status, setStatus] = useState<LocalTestsStatus>('idle');
  const [command, setCommand] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const runId = useRef<string | null>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    setStatus('idle');
    setCommand(null);
    setMessage(null);
    setOutput('');
    return () => {
      live.current = false;
    };
  }, [rootId]);

  const run = useCallback(async () => {
    setStatus('running');
    setMessage(null);
    setOutput('');
    try {
      const entries = await listWorkspaceFiles(rootId, '');
      const names = entries.map((entry) => entry.name);
      const manifest = names.includes(PACKAGE_MANIFEST)
        ? (await readWorkspaceText(rootId, PACKAGE_MANIFEST)).text
        : null;
      const detected = detectTestCommand(names, manifest);
      if (!live.current) return;
      setCommand(detected);
      if (detected === null) {
        setStatus('unavailable');
        setMessage(LOCAL_CODE_COPY.testsNotFound);
        return;
      }
      const started = startLocalCommand(
        { rootId, command: detected, timeoutMs: SHELL_TIMEOUT_MAX_MS },
        (chunk) => {
          if (live.current) setOutput((previous) => previous + chunk.text);
        },
      );
      runId.current = started.runId;
      const result = await started.result;
      if (!live.current) return;
      setOutput(`${result.stdout}${result.stderr}`);
      setStatus(result.exitCode === 0 && !result.timedOut ? 'passed' : 'failed');
      setMessage(outcomeMessage(detected, result));
    } catch (cause: unknown) {
      if (!live.current) return;
      if (cause instanceof DesktopRuntimeError && cause.code === 'cancelled') {
        setStatus('idle');
        return;
      }
      setStatus('failed');
      setMessage(toUserMessage(cause, LOCAL_CODE_COPY.testsCouldNotStart));
    } finally {
      runId.current = null;
    }
  }, [rootId]);

  const stop = useCallback(() => {
    if (runId.current !== null) void cancelLocalCommand(runId.current);
  }, []);

  return { status, command, message, output, run, stop };
}
