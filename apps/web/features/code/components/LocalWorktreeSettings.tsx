'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_WORKTREE_SETTINGS_COPY } from '../local-code';
import { localWorktreeKeep } from '../services/local-review-client';

export interface LocalWorktreeSettingsProps {
  /** Any approved folder: the count belongs to the CLI, not to one folder. */
  rootId: string;
  headingClassName: string;
  fieldClassName: string;
  buttonClassName: string;
  /** Called once the CLI answered or failed, so the CLI is running and has said what it serves. */
  onCliAnswered?: () => void;
}

type KeepState =
  | { status: 'loading' }
  | { status: 'ready'; keep: number; maxKeep: number }
  | { status: 'unavailable'; reason: string };

/**
 * "Keep the newest N worktrees", read from and written through the AGI CLI so
 * the count the page shows is the one cleanup applies. While no CLI is running,
 * or when the count cannot be read, the row stays, disabled, saying why.
 */
export function LocalWorktreeSettings({
  rootId,
  headingClassName,
  fieldClassName,
  buttonClassName,
  onCliAnswered,
}: LocalWorktreeSettingsProps) {
  const fieldId = useId();
  const reasonId = useId();
  const [state, setState] = useState<KeepState>({ status: 'loading' });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    localWorktreeKeep(rootId)
      .then((current) => {
        if (cancelled) return;
        if (current === null) {
          setState({ status: 'unavailable', reason: LOCAL_WORKTREE_SETTINGS_COPY.notRunning });
          return;
        }
        setState({ status: 'ready', ...current });
        setDraft(String(current.keep));
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          status: 'unavailable',
          reason: toUserMessage(cause, LOCAL_WORKTREE_SETTINGS_COPY.readFailed),
        });
      })
      .finally(() => {
        if (!cancelled) onCliAnswered?.();
      });
    return () => {
      cancelled = true;
    };
  }, [rootId, onCliAnswered]);

  if (state.status === 'loading') return null;

  const ready = state.status === 'ready' ? state : null;
  const parsed = Number(draft);
  const valid =
    ready !== null && Number.isInteger(parsed) && parsed >= 1 && parsed <= ready.maxKeep;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (ready === null || !valid || parsed === ready.keep) return;
    setBusy(true);
    try {
      const next = await localWorktreeKeep(rootId, parsed);
      if (next === null) throw new Error(LOCAL_WORKTREE_SETTINGS_COPY.saveFailed);
      setState({ status: 'ready', ...next });
      setDraft(String(next.keep));
      setMessage(LOCAL_WORKTREE_SETTINGS_COPY.saved(next.keep));
    } catch (cause: unknown) {
      setMessage(toUserMessage(cause, LOCAL_WORKTREE_SETTINGS_COPY.saveFailed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-2" onSubmit={(event) => void submit(event)}>
      <h4 className={headingClassName}>{LOCAL_WORKTREE_SETTINGS_COPY.heading}</h4>
      <p className="text-sm text-muted-foreground">{LOCAL_WORKTREE_SETTINGS_COPY.intro}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={fieldId} className="flex flex-col gap-1 text-sm text-muted-foreground">
          {LOCAL_WORKTREE_SETTINGS_COPY.label}
          <input
            id={fieldId}
            type="number"
            inputMode="numeric"
            min={1}
            max={ready?.maxKeep}
            step={1}
            className={fieldClassName}
            value={draft}
            disabled={ready === null}
            aria-invalid={ready !== null && !valid}
            aria-describedby={ready === null ? reasonId : undefined}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className={buttonClassName}
          disabled={ready === null || busy || !valid || parsed === ready.keep}
        >
          {LOCAL_WORKTREE_SETTINGS_COPY.save}
        </button>
      </div>
      {state.status === 'unavailable' && (
        <p id={reasonId} className="text-sm text-muted-foreground">
          {state.reason}
        </p>
      )}
      {ready !== null && !valid && (
        <p className="text-sm text-muted-foreground">
          {LOCAL_WORKTREE_SETTINGS_COPY.range(ready.maxKeep)}
        </p>
      )}
      {message !== null && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
