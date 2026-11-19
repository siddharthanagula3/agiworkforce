'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  OLD_ARCHIVE_AGE_DAYS,
  OLD_LOG_AGE_DAYS,
  type StorageCategory,
  type StorageCleanup,
  type StorageUsage,
} from '@agiworkforce/local-runtime-contract';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { formatBytes } from '@/shared/utils/format';
import { toUserMessage } from '@/lib/user-error-message';
import { useElectronHost } from '../lib/host';
import { cleanStorage, readStorageUsage } from '../lib/runtime-client';
import {
  DESKTOP_SETTINGS_BUTTON_CLASS,
  DesktopSettingsGroup,
  DesktopSettingsHeading,
  DesktopSettingsRow,
} from './DesktopSettingsRow';

const HEADING = 'Storage';
const HEADING_HINT = 'What AGI keeps on this computer, and what you can clear.';
const REFRESH_LABEL = 'Refresh';
const LOADING = 'Measuring…';
const READ_FAILED = 'Storage use could not be measured.';
const CLEAN_FAILED = 'That could not be cleared.';
const LOCATION_LABEL = 'Data folder';
const CLEANUP_HEADING = 'Clean up';
const AT_LEAST = 'at least';

const CATEGORY_LABELS: Record<StorageCategory, string> = {
  sessions: 'Coding sessions',
  worktrees: 'Worktrees',
  'web-cache': 'Web cache',
  logs: 'Logs',
  caches: 'Caches',
  'app-data': 'App data',
};

const CATEGORY_SHADES: Record<StorageCategory, string> = {
  sessions: 'opacity-100',
  worktrees: 'opacity-75',
  'web-cache': 'opacity-55',
  logs: 'opacity-40',
  caches: 'opacity-25',
  'app-data': 'opacity-15',
};

interface CleanupCopy {
  label: string;
  hint: string;
  button: string;
  title: string;
  description: string;
}

const CLEANUPS: Record<StorageCleanup, CleanupCopy> = {
  'web-cache': {
    label: 'Web cache',
    hint: 'Pages and images saved to load faster. They download again when needed.',
    button: 'Clear',
    title: 'Clear the web cache?',
    description:
      'Saved copies of pages and images are deleted and cannot be recovered. You stay signed in, and the app downloads them again as you use it.',
  },
  'old-logs': {
    label: 'Old logs',
    hint: `Log files older than ${OLD_LOG_AGE_DAYS} days.`,
    button: 'Delete',
    title: 'Delete old logs?',
    description: `Log files older than ${OLD_LOG_AGE_DAYS} days are deleted and cannot be recovered. Support cannot use them to look into problems from that time.`,
  },
  'archived-sessions': {
    label: 'Old archived sessions',
    hint: `Coding sessions archived more than ${OLD_ARCHIVE_AGE_DAYS} days ago.`,
    button: 'Delete',
    title: 'Delete old archived sessions?',
    description: `Coding sessions archived more than ${OLD_ARCHIVE_AGE_DAYS} days ago are deleted with their conversations and checkpoints, and cannot be recovered. The app asks once more with the number of sessions. Files in your folders are not touched.`,
  },
  'shell-scratch': {
    label: 'Temporary command files',
    hint: 'Left behind by commands that did not finish cleanly.',
    button: 'Delete',
    title: 'Delete temporary command files?',
    description:
      'Temporary folders older than a day, left by commands that stopped early, are deleted and cannot be recovered. Your projects are not touched.',
  },
};

type UsageState =
  | { status: 'loading' }
  | { status: 'ready'; usage: StorageUsage }
  | { status: 'failed'; message: string };

export function StorageSettings() {
  const host = useElectronHost();
  const { confirm, dialog } = useConfirmAction();
  const [state, setState] = useState<UsageState>({ status: 'loading' });
  const [busy, setBusy] = useState<StorageCleanup | 'refresh' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const measure = useCallback(async () => {
    setBusy('refresh');
    try {
      setState({ status: 'ready', usage: await readStorageUsage() });
    } catch (cause: unknown) {
      setState({ status: 'failed', message: toUserMessage(cause, READ_FAILED) });
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    if (host) void measure();
  }, [host, measure]);

  if (!host) return null;

  const usage = state.status === 'ready' ? state.usage : null;

  const askToClean = (cleanup: StorageCleanup) => {
    const copy = CLEANUPS[cleanup];
    confirm({
      title: copy.title,
      description: copy.description,
      confirmLabel: copy.button,
      destructive: true,
      onConfirm: async () => {
        setBusy(cleanup);
        setFailure(null);
        try {
          setState({ status: 'ready', usage: await cleanStorage(cleanup) });
        } catch (cause: unknown) {
          setFailure(toUserMessage(cause, CLEAN_FAILED));
        } finally {
          setBusy(null);
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <DesktopSettingsHeading title={HEADING} hint={HEADING_HINT} />
        <button
          type="button"
          className={DESKTOP_SETTINGS_BUTTON_CLASS}
          disabled={busy !== null}
          onClick={() => void measure()}
        >
          {REFRESH_LABEL}
        </button>
      </div>

      {state.status === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-[var(--text-3)]" role="status">
          <Spinner size="sm" aria-hidden="true" />
          {LOADING}
        </p>
      )}
      {state.status === 'failed' && (
        <p className="text-sm text-[var(--settings-destructive-text)]" role="alert">
          {state.message}
        </p>
      )}

      {usage && (
        <section className="flex flex-col gap-3" aria-label={HEADING}>
          <p className="text-2xl font-semibold tabular-nums text-[var(--text-1)]">
            {formatBytes(usage.totalBytes)}
          </p>
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--settings-border)]"
            role="img"
            aria-label={usage.categories
              .map((row) => `${CATEGORY_LABELS[row.category]} ${formatBytes(row.bytes)}`)
              .join(', ')}
          >
            {usage.totalBytes > 0 &&
              usage.categories
                .filter((row) => row.bytes > 0)
                .map((row) => (
                  <span
                    key={row.category}
                    className={`h-full bg-[var(--text-1)] ${CATEGORY_SHADES[row.category]}`}
                    style={{ width: `${(row.bytes / usage.totalBytes) * 100}%` }}
                  />
                ))}
          </div>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {usage.categories.map((row) => (
              <li key={row.category} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-[var(--text-1)]">
                  <span
                    aria-hidden="true"
                    className={`size-2.5 rounded-sm bg-[var(--text-1)] ${CATEGORY_SHADES[row.category]}`}
                  />
                  {CATEGORY_LABELS[row.category]}
                </span>
                <span className="tabular-nums text-[var(--text-3)]">
                  {row.partial ? `${AT_LEAST} ` : ''}
                  {formatBytes(row.bytes)}
                </span>
              </li>
            ))}
          </ul>
          <p className="break-all text-sm text-[var(--text-3)]">
            {LOCATION_LABEL}: {usage.dataPath}
          </p>
        </section>
      )}

      <DesktopSettingsGroup title={CLEANUP_HEADING}>
        {(Object.keys(CLEANUPS) as StorageCleanup[]).map((cleanup) => (
          <DesktopSettingsRow
            key={cleanup}
            label={CLEANUPS[cleanup].label}
            hint={CLEANUPS[cleanup].hint}
          >
            <button
              type="button"
              className={DESKTOP_SETTINGS_BUTTON_CLASS}
              disabled={busy !== null}
              onClick={() => askToClean(cleanup)}
            >
              {busy === cleanup ? (
                <Spinner size="sm" aria-hidden="true" />
              ) : (
                CLEANUPS[cleanup].button
              )}
            </button>
          </DesktopSettingsRow>
        ))}
      </DesktopSettingsGroup>
      {failure !== null && (
        <p className="text-sm text-[var(--settings-destructive-text)]" role="alert">
          {failure}
        </p>
      )}
      {dialog}
    </div>
  );
}
