'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DesktopRuntimeError,
  type ShellRunResult,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import { Spinner } from '@agiworkforce/ui';
import {
  cancelLocalCommand,
  listWorkspaceRoots,
  pickWorkspaceRoot,
  startLocalCommand,
} from '../lib/runtime-client';

const TITLE = 'Run a local command';
const INTRO =
  'Runs one program in a folder you have approved, on this Mac, as you. There is no shell, so pipes, redirects and variables are not available.';
const NO_ROOTS_COPY =
  'No folders are approved yet. Choose one first; a command only ever runs inside a folder you picked.';
const RUN_FAILED = 'That command did not run.';
const LOAD_FAILED = 'Approved folders could not be read.';

const BUTTON_CLASS =
  'min-h-[32px] rounded-md border border-border/60 px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60';
const FIELD_CLASS =
  'min-h-[36px] w-full rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus-visible:border-[var(--chat-accent-primary)]';

export interface LocalCommandDialogProps {
  open: boolean;
  onClose: () => void;
  onAttach: (files: File[]) => void;
}

interface OutputLine {
  stream: 'stdout' | 'stderr';
  text: string;
}

function messageFor(error: unknown, fallback: string): string | null {
  if (error instanceof DesktopRuntimeError) {
    return error.code === 'cancelled' ? null : error.message;
  }
  return fallback;
}

function describeOutcome(result: ShellRunResult): string {
  if (result.timedOut) return 'Stopped: the command ran past its time limit.';
  if (result.exitCode === 0) return `Finished in ${Math.round(result.durationMs / 100) / 10}s.`;
  if (result.exitCode === null) return `Stopped${result.signal ? ` (${result.signal})` : ''}.`;
  return `Exited with code ${result.exitCode}.`;
}

/**
 * Everything the command printed.
 *
 * Read from the finished result rather than from the streamed chunks: the
 * stream is a live preview and can start after the run does, which is what
 * happens on the first command of a session, where the native permission sheet
 * stands between the request and the first chunk. The result always carries the
 * whole thing.
 */
function completedOutput(result: ShellRunResult): string {
  return `${result.stdout}${result.stderr}`;
}

function transcriptFile(result: ShellRunResult, root: WorkspaceRoot, nowMs: number): File {
  const location = result.cwd === '' ? root.name : `${root.name}/${result.cwd}`;
  const body = [
    `$ ${result.command}`,
    `# in ${location}`,
    '',
    completedOutput(result),
    '',
    describeOutcome(result),
    result.truncated ? 'Output was cut off at the size limit.' : '',
  ]
    .filter((part) => part !== '')
    .join('\n');
  return new File([body], `command-output-${nowMs}.txt`, {
    type: 'text/plain',
    lastModified: nowMs,
  });
}

/**
 * A local command, run by the user, whose output they choose to put in the
 * conversation.
 *
 * Two gates stand between this and a running process: the shell.execute grant
 * the desktop asks for the first time a folder runs anything, and the per
 * command prompt the desktop raises for any program that is not on the user's
 * allowed list. Neither lives here, because a renderer cannot be the thing
 * that decides what a renderer may run.
 */
export function LocalCommandDialog({ open, onClose, onAttach }: LocalCommandDialogProps) {
  const [roots, setRoots] = useState<WorkspaceRoot[]>([]);
  const [activeRoot, setActiveRoot] = useState<WorkspaceRoot | null>(null);
  const [folder, setFolder] = useState('');
  const [command, setCommand] = useState('');
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [result, setResult] = useState<ShellRunResult | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLPreElement | null>(null);
  const runIdRef = useRef<string | null>(null);
  runIdRef.current = runId;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listWorkspaceRoots()
      .then((next) => {
        setRoots(next);
        setActiveRoot((current) => current ?? next[0] ?? null);
        setError(null);
      })
      .catch((cause: unknown) => setError(messageFor(cause, LOAD_FAILED)))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    const pane = outputRef.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [lines]);

  const close = useCallback(() => {
    const active = runIdRef.current;
    if (active) void cancelLocalCommand(active);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  const onAddRoot = useCallback(async () => {
    try {
      const granted = await pickWorkspaceRoot();
      setRoots((current) => [...current.filter((root) => root.id !== granted.id), granted]);
      setActiveRoot(granted);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause, LOAD_FAILED));
    }
  }, []);

  const onRun = useCallback(async () => {
    if (!activeRoot || command.trim() === '' || runId) return;
    setLines([]);
    setResult(null);
    setError(null);

    let run;
    try {
      run = startLocalCommand(
        {
          rootId: activeRoot.id,
          command: command.trim(),
          ...(folder.trim() === '' ? {} : { path: folder.trim() }),
        },
        (output) =>
          setLines((current) => [...current, { stream: output.stream, text: output.text }]),
      );
    } catch (cause) {
      setError(messageFor(cause, RUN_FAILED));
      return;
    }

    setRunId(run.runId);
    try {
      setResult(await run.result);
    } catch (cause) {
      setError(messageFor(cause, RUN_FAILED));
    } finally {
      setRunId(null);
    }
  }, [activeRoot, command, folder, runId]);

  const onStop = useCallback(() => {
    if (runId) void cancelLocalCommand(runId);
  }, [runId]);

  const onAddToChat = useCallback(() => {
    if (!result || !activeRoot) return;
    onAttach([transcriptFile(result, activeRoot, Date.now())]);
    close();
  }, [result, activeRoot, onAttach, close]);

  if (!open || typeof document === 'undefined') return null;

  const output = result ? completedOutput(result) : lines.map((line) => line.text).join('');
  const hasStderr = result ? result.stderr !== '' : lines.some((line) => line.stream === 'stderr');

  /**
   * Portaled to the body: the composer sits inside a transformed ancestor,
   * which becomes the containing block for `fixed` and clips a panel this tall
   * against the bottom of the composer rather than the window.
   */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={TITLE}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={close}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-xl border border-border/60 bg-popover p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">{TITLE}</h2>
          <button type="button" className={BUTTON_CLASS} onClick={close}>
            Close
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{INTRO}</p>

        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}

        {loading && roots.length === 0 ? <Spinner aria-label="Loading approved folders" /> : null}

        {roots.length === 0 && !loading ? (
          <>
            <p className="text-xs text-muted-foreground">{NO_ROOTS_COPY}</p>
            <button type="button" className={BUTTON_CLASS} onClick={() => void onAddRoot()}>
              Choose a folder
            </button>
          </>
        ) : null}

        {roots.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {roots.map((root) => (
              <button
                key={root.id}
                type="button"
                aria-pressed={root.id === activeRoot?.id}
                className={BUTTON_CLASS}
                onClick={() => setActiveRoot(root)}
              >
                {root.name}
              </button>
            ))}
            <button type="button" className={BUTTON_CLASS} onClick={() => void onAddRoot()}>
              Add a folder
            </button>
          </div>
        ) : null}

        {activeRoot ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Folder inside {activeRoot.name}, optional
              <input
                className={FIELD_CLASS}
                value={folder}
                placeholder="apps/web"
                onChange={(event) => setFolder(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Command
              <input
                className={FIELD_CLASS}
                value={command}
                placeholder="git status --short"
                disabled={runId !== null}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void onRun();
                }}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={BUTTON_CLASS}
                disabled={runId !== null || command.trim() === ''}
                onClick={() => void onRun()}
              >
                Run
              </button>
              {runId ? (
                <button type="button" className={BUTTON_CLASS} onClick={onStop}>
                  Stop
                </button>
              ) : null}
              {result ? (
                <button type="button" className={BUTTON_CLASS} onClick={onAddToChat}>
                  Add output to chat
                </button>
              ) : null}
              {runId ? <Spinner aria-label="Running" /> : null}
            </div>
          </div>
        ) : null}

        {output === '' && !result ? null : (
          <pre
            ref={outputRef}
            aria-label="Command output"
            className={`max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border/40 bg-muted/30 p-3 font-mono text-xs ${
              hasStderr ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {output}
          </pre>
        )}

        <p aria-live="polite" className="min-h-[16px] text-xs text-muted-foreground">
          {result ? describeOutcome(result) : runId ? 'Running…' : ''}
          {result?.truncated ? ' Output was cut off at the size limit.' : ''}
        </p>
      </div>
    </div>,
    document.body,
  );
}
