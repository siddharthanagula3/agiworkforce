'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HOST_SHORTCUT_CHOICES,
  HOST_SHORTCUT_KEYS,
  HOST_SHORTCUT_PREFERENCE_KEYS,
  NO_HOST_SHORTCUT,
  describeAccelerator,
  describeHostPlatform,
  type HostPreferences,
  type HostPreferencesState,
  type HostShortcutKey,
  type DeveloperRuntimeStatus,
  type HostShortcutStatus,
} from '@agiworkforce/local-runtime-contract';
import { Switch } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import { useDesktopHost } from '../lib/host';
import { readDeveloperRuntimeStatus } from '../lib/runtime-client';
import { DesktopUpdateRow } from './DesktopUpdateRow';

const HEADING = 'General desktop settings';
const HEADING_HINT = 'How the app behaves on this computer.';
const LOAD_FAILED = 'These settings could not be read from the app.';
const NO_SHORTCUT_LABEL = 'No shortcut';

const STARTUP_LABEL = 'Run on startup';
const STARTUP_HINT = 'Start AGI Cloud when you log in to this computer.';
const MENU_BAR_LABEL = 'Menu bar';
const MENU_BAR_HINT = 'Show AGI Cloud in the menu bar.';
const CLI_PATH_LABEL = 'AGI CLI path';
const CLI_PATH_HINT = 'Leave empty to use the agi on this computer’s PATH.';
const CLI_PATH_PLACEHOLDER = 'agi';
const CLI_MISSING = 'Not found on this computer. Install the AGI CLI to run coding sessions here.';
const CLI_RESOLVING = 'Looking for the AGI CLI…';

const CLI_ACCOUNT_FAILED = 'This account could not be given to the AGI CLI on this computer.';

function cliStateLine(status: DeveloperRuntimeStatus): string {
  if (!status.available) return [CLI_MISSING, status.hint].filter(Boolean).join(' ');
  const using = `Using ${status.name} ${status.version} from ${status.path}`;
  if (!status.accountSyncError) return using;
  return `${using}. ${CLI_ACCOUNT_FAILED} ${status.accountSyncError}`;
}

const SHORTCUT_ROWS: Record<HostShortcutKey, { label: string; hint: string }> = {
  quickAsk: {
    label: 'Quick Ask shortcut',
    hint: 'Message AGI from anywhere on your desktop.',
  },
  screenshot: {
    label: 'Screenshot to chat shortcut',
    hint: 'Capture part of the screen straight into a conversation.',
  },
  voice: {
    label: 'Voice shortcut',
    hint: 'Speak to AGI from anywhere on your desktop.',
  },
};

/**
 * What the shell reports back about a chord it could not claim. `registered`
 * and `off` say nothing: the control already shows both.
 */
const STATUS_NOTE: Partial<Record<HostShortcutStatus, string>> = {
  duplicate: 'Already used by another AGI Cloud shortcut.',
  taken: 'Already used by another app.',
  malformed: 'Not a shortcut this computer can register.',
};

function shortcutLabel(accelerator: string, platform: string): string {
  return accelerator === NO_HOST_SHORTCUT
    ? NO_SHORTCUT_LABEL
    : describeAccelerator(accelerator, platform);
}

function choicesFor(key: HostShortcutKey, current: string): string[] {
  const presets = [...HOST_SHORTCUT_CHOICES[key]];
  const known = current === NO_HOST_SHORTCUT || presets.includes(current);
  return [...(known ? [] : [current]), ...presets, NO_HOST_SHORTCUT];
}

export function DesktopSettingsSection() {
  const host = useDesktopHost();
  const [state, setState] = useState<HostPreferencesState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cliStatus, setCliStatus] = useState<DeveloperRuntimeStatus | null>(null);

  const resolveCli = useCallback(() => {
    if (!host) return;
    setCliStatus(null);
    readDeveloperRuntimeStatus()
      .then(setCliStatus)
      .catch(() =>
        setCliStatus({
          available: false,
          name: '',
          version: null,
          path: null,
          hint: null,
          accountSyncError: null,
        }),
      );
  }, [host]);

  useEffect(() => {
    resolveCli();
  }, [resolveCli]);

  useEffect(() => {
    if (!host) return;
    let cancelled = false;
    host
      .readPreferences()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(toUserMessage(cause, LOAD_FAILED));
      });
    return () => {
      cancelled = true;
    };
  }, [host]);

  const write = useCallback(
    (patch: Partial<HostPreferences>) => {
      if (!host) return;
      setError(null);
      host
        .writePreferences(patch)
        .then(setState)
        .catch((cause: unknown) => setError(toUserMessage(cause, LOAD_FAILED)));
    },
    [host],
  );

  if (!host) return null;

  const preferences = state?.preferences;
  const platformName = describeHostPlatform(host.platform);

  return (
    <section className="flex flex-col gap-4" aria-label={HEADING}>
      <div>
        <h2 className="text-base font-semibold text-[var(--text-1)]">{HEADING}</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">{HEADING_HINT}</p>
      </div>

      {error !== null && (
        <p className="text-sm text-[var(--settings-destructive-text)]" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col">
        <Row label={STARTUP_LABEL} hint={STARTUP_HINT}>
          <Switch
            checked={preferences?.launchAtLogin ?? false}
            disabled={!preferences}
            onCheckedChange={(checked) => write({ launchAtLogin: checked })}
            aria-label={STARTUP_LABEL}
          />
        </Row>

        {HOST_SHORTCUT_KEYS.map((key) => {
          const preferenceKey = HOST_SHORTCUT_PREFERENCE_KEYS[key];
          const current = (preferences?.[preferenceKey] as string | undefined) ?? NO_HOST_SHORTCUT;
          const note = state ? STATUS_NOTE[state.shortcutStatus[key]] : undefined;

          return (
            <Row
              key={key}
              label={SHORTCUT_ROWS[key].label}
              hint={SHORTCUT_ROWS[key].hint}
              note={note}
            >
              <select
                value={current}
                disabled={!preferences}
                aria-label={SHORTCUT_ROWS[key].label}
                onChange={(event) => write({ [preferenceKey]: event.target.value })}
                className="h-8 max-w-[220px] rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                {choicesFor(key, current).map((choice) => (
                  <option key={choice === NO_HOST_SHORTCUT ? 'none' : choice} value={choice}>
                    {shortcutLabel(choice, host.platform)}
                  </option>
                ))}
              </select>
            </Row>
          );
        })}

        <Row
          label={CLI_PATH_LABEL}
          hint={CLI_PATH_HINT}
          note={cliStatus === null ? CLI_RESOLVING : cliStateLine(cliStatus)}
          noteIsFailure={
            cliStatus !== null && (!cliStatus.available || cliStatus.accountSyncError !== null)
          }
        >
          <CliPathField
            value={preferences?.cliPath ?? ''}
            disabled={!preferences}
            onCommit={(cliPath) => {
              write({ cliPath });
              resolveCli();
            }}
            onResolve={resolveCli}
          />
        </Row>

        <Row label={MENU_BAR_LABEL} hint={MENU_BAR_HINT}>
          <Switch
            checked={preferences?.showInMenuBar ?? false}
            disabled={!preferences}
            onCheckedChange={(checked) => write({ showInMenuBar: checked })}
            aria-label={MENU_BAR_LABEL}
          />
        </Row>

        <DesktopUpdateRow />
      </div>

      {platformName !== null && (
        <p className="text-xs text-[var(--text-3)]">AGI Cloud on {platformName}</p>
      )}
    </section>
  );
}

function CliPathField({
  value,
  disabled,
  onCommit,
  onResolve,
}: {
  value: string;
  disabled: boolean;
  onCommit: (value: string) => void;
  onResolve: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);

  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    setDraft(value);
  }, [value]);

  const commit = () => {
    const next = draft.trim();
    if (next === committed.current) {
      onResolve();
      return;
    }
    committed.current = next;
    onCommit(next);
  };

  return (
    <input
      type="text"
      spellCheck={false}
      value={draft}
      disabled={disabled}
      aria-label={CLI_PATH_LABEL}
      placeholder={CLI_PATH_PLACEHOLDER}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className="h-8 w-[220px] max-w-[220px] rounded-md border border-border bg-background px-2 text-sm text-foreground"
    />
  );
}

function Row({
  label,
  hint,
  note,
  noteIsFailure = true,
  children,
}: {
  label: string;
  hint: string;
  note?: string;
  noteIsFailure?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--settings-border)] py-[14px]">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-[var(--text-1)]">{label}</span>
        <span className="text-xs text-[var(--text-3)]">{hint}</span>
        {note !== undefined && (
          <span
            className={
              noteIsFailure
                ? 'text-xs text-[var(--settings-destructive-text)]'
                : 'text-xs text-[var(--text-3)]'
            }
          >
            {note}
          </span>
        )}
      </span>
      {children}
    </div>
  );
}
