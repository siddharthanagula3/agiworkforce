'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  validationSummaryFromChecks,
  type CloudCodeCheckResult,
  type CloudCodeValidationSummary,
} from '@/lib/services/cloud-code-result';
import { LOCAL_CODE_COPY, detectTestCommand } from '../local-code';

const PACKAGE_MANIFEST = 'package.json';

export type LocalTestsStatus = 'idle' | 'running' | 'passed' | 'failed' | 'unavailable';

export interface LocalTestsState {
  status: LocalTestsStatus;
  command: string | null;
  message: string | null;
  output: string;
  /**
   * The one validation record every surface reads, so a claim about this
   * folder is backed by an exit code rather than by the status word.
   */
  summary: CloudCodeValidationSummary;
  run: () => Promise<void>;
  stop: () => void;
}

function outcomeMessage(command: string, result: ShellRunResult): string {
  if (result.timedOut) return LOCAL_CODE_COPY.testsTimedOut(command);
  if (result.exitCode === 0) return LOCAL_CODE_COPY.testsPassed(command);
  return LOCAL_CODE_COPY.testsFailed(command, result.exitCode);
}

// A run that timed out has no verdict, so it is never a pass even at exit 0.
function testsCheck(command: string, result: ShellRunResult): CloudCodeCheckResult {
  return {
    kind: 'tests',
    command,
    exitCode: result.exitCode,
    outcome: result.timedOut ? 'unknown' : result.exitCode === 0 ? 'passed' : 'failed',
  };
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
  const [checks, setChecks] = useState<CloudCodeCheckResult[]>([]);
  const runId = useRef<string | null>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    setStatus('idle');
    setCommand(null);
    setMessage(null);
    setOutput('');
    setChecks([]);
    return () => {
      live.current = false;
    };
  }, [rootId]);

  const run = useCallback(async () => {
    setStatus('running');
    setMessage(null);
    setOutput('');
    setChecks([]);
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
      setChecks([testsCheck(detected, result)]);
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

  const summary = useMemo(() => validationSummaryFromChecks(checks), [checks]);

  return { status, command, message, output, summary, run, stop };
}
