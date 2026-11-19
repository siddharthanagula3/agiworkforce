'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  AUTO_ARCHIVE_IDLE_DAYS,
  MAX_WORKTREE_BRANCH_PREFIX_LENGTH,
  isAutoArchiveIdleDays,
  isWorktreeBranchPrefix,
  type HostPreferences,
  type HostPreferencesState,
} from '@agiworkforce/local-runtime-contract';
import { useDesktopHost } from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_WORKTREE_SETTINGS_COPY } from '../local-code';

const EXAMPLE_SLUG = 'fix-sign-in';
const CHOOSE_LOCATION = 'choose';

export interface LocalWorktreePreferencesProps {
  headingClassName: string;
  fieldClassName: string;
  buttonClassName: string;
}

export function LocalWorktreePreferences({
  headingClassName,
  fieldClassName,
  buttonClassName,
}: LocalWorktreePreferencesProps) {
  const host = useDesktopHost();
  const prefixId = useId();
  const prefixHelpId = useId();
  const archiveId = useId();
  const [state, setState] = useState<HostPreferencesState | null>(null);
  const [prefixDraft, setPrefixDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!host) return undefined;
    let cancelled = false;
    host
      .readPreferences()
      .then((next) => {
        if (cancelled) return;
        setState(next);
        setPrefixDraft(next.preferences.worktreeBranchPrefix ?? '');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [host]);

  const preferences = state?.preferences;
  if (!host || preferences?.worktreeLocation === undefined) return null;
  const savedPrefix = preferences.worktreeBranchPrefix ?? '';
  const prefix = prefixDraft.trim();
  const prefixValid = isWorktreeBranchPrefix(prefix);

  const write = async (patch: Partial<HostPreferences>, success: string | null) => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await host.writePreferences(patch);
      setState(next);
      setPrefixDraft(next.preferences.worktreeBranchPrefix ?? '');
      setMessage(success);
    } catch (cause: unknown) {
      setMessage(toUserMessage(cause, LOCAL_WORKTREE_SETTINGS_COPY.preferencesFailed));
    } finally {
      setBusy(false);
    }
  };

  const submitPrefix = (event: FormEvent) => {
    event.preventDefault();
    if (!prefixValid || prefix === savedPrefix) return;
    void write({ worktreeBranchPrefix: prefix }, LOCAL_WORKTREE_SETTINGS_COPY.prefixSaved);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h5 className={headingClassName}>{LOCAL_WORKTREE_SETTINGS_COPY.locationLabel}</h5>
        <p className="break-all text-sm">
          {preferences.worktreeLocation === ''
            ? LOCAL_WORKTREE_SETTINGS_COPY.locationDefault
            : preferences.worktreeLocation}
        </p>
        <p className="text-sm text-muted-foreground">{LOCAL_WORKTREE_SETTINGS_COPY.locationHelp}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClassName}
            disabled={busy}
            onClick={() => void write({ worktreeLocation: CHOOSE_LOCATION }, null)}
          >
            {LOCAL_WORKTREE_SETTINGS_COPY.locationChange}
          </button>
          <button
            type="button"
            className={buttonClassName}
            disabled={busy || preferences.worktreeLocation === ''}
            onClick={() => void write({ worktreeLocation: '' }, null)}
          >
            {LOCAL_WORKTREE_SETTINGS_COPY.locationReset}
          </button>
        </div>
      </div>
      <form className="flex flex-col gap-1" onSubmit={submitPrefix}>
        <label htmlFor={prefixId} className={headingClassName}>
          {LOCAL_WORKTREE_SETTINGS_COPY.prefixLabel}
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <input
            id={prefixId}
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={MAX_WORKTREE_BRANCH_PREFIX_LENGTH}
            className={fieldClassName}
            value={prefixDraft}
            aria-invalid={!prefixValid}
            aria-describedby={prefixHelpId}
            onChange={(event) => setPrefixDraft(event.target.value)}
          />
          <button
            type="submit"
            className={buttonClassName}
            disabled={busy || !prefixValid || prefix === savedPrefix}
          >
            {LOCAL_WORKTREE_SETTINGS_COPY.save}
          </button>
        </div>
        <p id={prefixHelpId} className="text-sm text-muted-foreground">
          {prefixValid
            ? LOCAL_WORKTREE_SETTINGS_COPY.prefixHelp(`${prefix}${EXAMPLE_SLUG}`)
            : LOCAL_WORKTREE_SETTINGS_COPY.prefixInvalid(MAX_WORKTREE_BRANCH_PREFIX_LENGTH)}
        </p>
      </form>
      {preferences.autoArchiveIdleDays !== undefined && (
        <div className="flex flex-col gap-1">
          <label htmlFor={archiveId} className={headingClassName}>
            {LOCAL_WORKTREE_SETTINGS_COPY.autoArchiveLabel}
          </label>
          <select
            id={archiveId}
            className={fieldClassName}
            value={preferences.autoArchiveIdleDays}
            disabled={busy}
            onChange={(event) => {
              const days = Number(event.target.value);
              if (isAutoArchiveIdleDays(days)) void write({ autoArchiveIdleDays: days }, null);
            }}
          >
            {AUTO_ARCHIVE_IDLE_DAYS.map((days) => (
              <option key={days} value={days}>
                {days === 0
                  ? LOCAL_WORKTREE_SETTINGS_COPY.autoArchiveOff
                  : LOCAL_WORKTREE_SETTINGS_COPY.autoArchiveDays(days)}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            {LOCAL_WORKTREE_SETTINGS_COPY.autoArchiveHelp}
          </p>
        </div>
      )}
      {message !== null && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
