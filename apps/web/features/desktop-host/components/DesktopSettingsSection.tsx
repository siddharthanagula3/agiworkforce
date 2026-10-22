'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SESSION_COMPLETION_ALERTS,
  HOST_AGENT_NOTIFICATION_KINDS,
  HOST_AGENT_NOTIFICATION_MODES,
  HOST_SHORTCUT_CHOICES,
  HOST_SHORTCUT_KEYS,
  HOST_SHORTCUT_PREFERENCE_KEYS,
  NO_HOST_SHORTCUT,
  SESSION_COMPLETION_ALERT_LABELS,
  SESSION_COMPLETION_ALERTS,
  agentNotificationsWrite,
  describeAccelerator,
  describeHostPlatform,
  effectiveAgentNotifications,
  hostShortcutMayBeOff,
  type HostAgentNotificationKind,
  type HostAgentNotificationMode,
  type HostAgentNotificationPreferences,
  type HostPreferences,
  type HostPreferencesState,
  type HostShortcutKey,
  type DeveloperRuntimeStatus,
  type HostShortcutStatus,
  type SessionCompletionAlerts,
} from '@agiworkforce/local-runtime-contract';
import { Switch } from '@agiworkforce/ui';
import { isImeComposingKey } from '@agiworkforce/unified-chat/ime-composition';
import { toUserMessage } from '@/lib/user-error-message';
import { useDesktopHost } from '../lib/host';
import { readDeveloperRuntimeStatus } from '../lib/runtime-client';
import { BackgroundActivitySection } from './BackgroundActivitySection';
import { ComputerUseSettings } from './ComputerUseSettings';
import { DesktopPermissionsSection } from './DesktopPermissionsSection';
import { DesktopSettingsHeading, DesktopSettingsRow as Row } from './DesktopSettingsRow';
import { DesktopUpdateRow } from './DesktopUpdateRow';

const HEADING = 'General desktop settings';
const HEADING_HINT = 'How the app behaves on this computer.';
const LOAD_FAILED = 'These settings could not be read from the app.';
const SAVE_FAILED = 'That setting was not saved.';
const NO_SHORTCUT_LABEL = 'No shortcut';

const STARTUP_LABEL = 'Run on startup';
const STARTUP_HINT = 'Start AGI Desktop when you log in to this computer.';
const MENU_BAR_LABEL = 'Menu bar';
const MENU_BAR_HINT = 'Show AGI Desktop in the menu bar.';
const DICTATE_ELSEWHERE_LABEL = 'Dictate into the app you are using';
const DICTATE_ELSEWHERE_HINT =
  'With another app in front, the dictation shortcut opens a small bar there and types what you said into that app when you press it again.';
const COMPLETION_ALERTS_LABEL = 'Task finished alerts';
const COMPLETION_ALERTS_HINT =
  'Show a notification when a coding session on this computer finishes or stops.';
const APPROVAL_ALERTS_LABEL = 'Approval alerts';
const APPROVAL_ALERTS_HINT =
  'Show a notification when a coding session on this computer needs your approval.';
const CLI_PATH_LABEL = 'AGI CLI path';
const CLI_PATH_HINT =
  'Leave empty to use the AGI CLI bundled with the app, or the agi on this computer’s PATH.';
const CLI_PATH_PLACEHOLDER = 'agi';
const CLI_MISSING = 'Not found on this computer. Install the AGI CLI to run coding sessions here.';
const CLI_RESOLVING = 'Looking for the AGI CLI…';

const CLI_ACCOUNT_FAILED = 'This account could not be given to the AGI CLI on this computer.';

const CLI_SOURCE_LABELS: Record<NonNullable<DeveloperRuntimeStatus['source']>, string> = {
  bundled: 'Bundled with the app',
  custom: 'Custom path',
  path: 'From PATH',
};

function cliStateLine(status: DeveloperRuntimeStatus): string {
  if (!status.available) return [CLI_MISSING, status.hint].filter(Boolean).join(' ');
  const where = `Using ${status.name} ${status.version} from ${status.path}`;
  const description = status.source ? `${CLI_SOURCE_LABELS[status.source]}. ${where}` : where;
  if (!status.accountSyncError) return description;
  return `${description}. ${CLI_ACCOUNT_FAILED} ${status.accountSyncError}`;
}

const SHORTCUT_ROWS: Record<HostShortcutKey, { label: string; hint: string }> = {
  quickAsk: {
    label: 'Quick Ask shortcut',
    hint: 'Message AGI from anywhere on your desktop.',
  },
  newChat: {
    label: 'New chat shortcut',
    hint: 'Open the main window on a new chat from anywhere on your desktop.',
  },
  screenshot: {
    label: 'Screenshot to chat shortcut',
    hint: 'Capture the whole display your pointer is on and attach it to the conversation.',
  },
  windowShot: {
    label: 'Window to chat shortcut',
    hint: 'Capture the window you are working in, not the whole screen, straight into a conversation.',
  },
  voice: {
    label: 'Voice shortcut',
    hint: 'Speak to AGI from anywhere on your desktop.',
  },
  stop: {
    label: 'Stop agents shortcut',
    hint: 'Stop every running agent turn and take back screen control.',
  },
};

const NOTIFY_LABEL = 'Agent notifications';
const NOTIFY_HINT = 'When coding agents on this computer notify you.';
const NOTIFY_MODE_LABELS: Record<HostAgentNotificationMode, string> = {
  always: 'Always',
  unfocused: 'Only when AGI Desktop is in the background',
  never: 'Never',
};
const NOTIFY_KIND_ROWS: Record<HostAgentNotificationKind, { label: string; hint: string }> = {
  approval: {
    label: 'Approval requests',
    hint: 'An agent is waiting for you to allow or deny a step.',
  },
  question: {
    label: 'Questions',
    hint: 'An agent asked you something before it carries on.',
  },
  'turn-complete': {
    label: 'Finished turns',
    hint: 'An agent finished what you asked.',
  },
  'turn-failed': {
    label: 'Failed turns',
    hint: 'An agent stopped because of an error.',
  },
};
const NOTIFY_SOUND_LABEL = 'Notification sound';
const NOTIFY_SOUND_HINT = 'Play the system sound with agent notifications.';

/**
 * What the shell reports back about a chord it could not claim. `registered`
 * and `off` say nothing: the control already shows both.
 */
const STATUS_NOTE: Partial<Record<HostShortcutStatus, string>> = {
  duplicate: 'Already used by another AGI Desktop shortcut.',
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
  return [
    ...(known ? [] : [current]),
    ...presets,
    ...(hostShortcutMayBeOff(key) ? [NO_HOST_SHORTCUT] : []),
  ];
}

export function DesktopSettingsSection() {
  const host = useDesktopHost();
  const [state, setState] = useState<HostPreferencesState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cliStatus, setCliStatus] = useState<DeveloperRuntimeStatus | null>(null);
  const [cliWrites, setCliWrites] = useState(0);

  const cliReads = useRef(0);
  const resolveCli = useCallback(() => {
    if (!host) return;
    cliReads.current += 1;
    const read = cliReads.current;
    setCliStatus(null);
    readDeveloperRuntimeStatus()
      .catch((): DeveloperRuntimeStatus => ({
        available: false,
        name: '',
        version: null,
        path: null,
        hint: null,
        accountSyncError: null,
      }))
      .then((status) => {
        if (read === cliReads.current) setCliStatus(status);
      });
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
    (patch: Partial<HostPreferences>): Promise<void> => {
      if (!host) return Promise.resolve();
      setError(null);
      return host
        .writePreferences(patch)
        .then(setState)
        .catch((cause: unknown) => setError(toUserMessage(cause, SAVE_FAILED)));
    },
    [host],
  );

  if (!host) return null;

  const preferences = state?.preferences;
  const platformName = describeHostPlatform(host.platform);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4" aria-label={HEADING}>
        <DesktopSettingsHeading title={HEADING} hint={HEADING_HINT} />

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
            if (preferences && preferences[preferenceKey] === undefined) return null;
            const current =
              (preferences?.[preferenceKey] as string | undefined) ?? NO_HOST_SHORTCUT;
            const status = state?.shortcutStatus[key];
            const note = status ? STATUS_NOTE[status] : undefined;

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
              key={cliWrites}
              value={preferences?.cliPath ?? ''}
              disabled={!preferences}
              onCommit={(cliPath) => {
                void write({ cliPath }).then(() => {
                  setCliWrites((count) => count + 1);
                  resolveCli();
                });
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

          {preferences?.dictateIntoFocusedApp !== undefined && (
            <Row label={DICTATE_ELSEWHERE_LABEL} hint={DICTATE_ELSEWHERE_HINT}>
              <Switch
                checked={preferences.dictateIntoFocusedApp}
                onCheckedChange={(checked) => write({ dictateIntoFocusedApp: checked })}
                aria-label={DICTATE_ELSEWHERE_LABEL}
              />
            </Row>
          )}

          {preferences?.agentNotifications === undefined ? (
            <>
              <Row label={COMPLETION_ALERTS_LABEL} hint={COMPLETION_ALERTS_HINT}>
                <select
                  value={preferences?.sessionCompletionAlerts ?? DEFAULT_SESSION_COMPLETION_ALERTS}
                  disabled={!preferences}
                  aria-label={COMPLETION_ALERTS_LABEL}
                  onChange={(event) =>
                    write({
                      sessionCompletionAlerts: event.target.value as SessionCompletionAlerts,
                    })
                  }
                  className="h-8 max-w-[220px] rounded-md border border-border bg-background px-2 text-sm text-foreground"
                >
                  {SESSION_COMPLETION_ALERTS.map((mode) => (
                    <option key={mode} value={mode}>
                      {SESSION_COMPLETION_ALERT_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </Row>

              <Row label={APPROVAL_ALERTS_LABEL} hint={APPROVAL_ALERTS_HINT}>
                <Switch
                  checked={preferences?.sessionApprovalAlerts ?? false}
                  disabled={!preferences}
                  onCheckedChange={(checked) => write({ sessionApprovalAlerts: checked })}
                  aria-label={APPROVAL_ALERTS_LABEL}
                />
              </Row>
            </>
          ) : (
            <AgentNotificationRows
              value={effectiveAgentNotifications(preferences)}
              onChange={(next) => write(agentNotificationsWrite(next))}
            />
          )}

          <DesktopUpdateRow />
        </div>

        {platformName !== null && (
          <p className="text-xs text-[var(--text-3)]">AGI Desktop on {platformName}</p>
        )}
      </section>

      <ComputerUseSettings />
      <BackgroundActivitySection />
      <DesktopPermissionsSection />
    </div>
  );
}

function AgentNotificationRows({
  value,
  onChange,
}: {
  value: HostAgentNotificationPreferences;
  onChange: (next: HostAgentNotificationPreferences) => void;
}) {
  const off = value.when === 'never';
  return (
    <>
      <Row label={NOTIFY_LABEL} hint={NOTIFY_HINT}>
        <select
          value={value.when}
          aria-label={NOTIFY_LABEL}
          onChange={(event) =>
            onChange({ ...value, when: event.target.value as HostAgentNotificationMode })
          }
          className="h-8 max-w-[220px] rounded-md border border-border bg-background px-2 text-sm text-foreground"
        >
          {HOST_AGENT_NOTIFICATION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {NOTIFY_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </Row>
      {HOST_AGENT_NOTIFICATION_KINDS.map((kind) => (
        <Row key={kind} label={NOTIFY_KIND_ROWS[kind].label} hint={NOTIFY_KIND_ROWS[kind].hint}>
          <Switch
            checked={!off && !value.muted.includes(kind)}
            disabled={off}
            onCheckedChange={(checked) =>
              onChange({
                ...value,
                muted: checked
                  ? value.muted.filter((muted) => muted !== kind)
                  : [...value.muted, kind],
              })
            }
            aria-label={NOTIFY_KIND_ROWS[kind].label}
          />
        </Row>
      ))}
      <Row label={NOTIFY_SOUND_LABEL} hint={NOTIFY_SOUND_HINT}>
        <Switch
          checked={!off && value.sound}
          disabled={off}
          onCheckedChange={(sound) => onChange({ ...value, sound })}
          aria-label={NOTIFY_SOUND_LABEL}
        />
      </Row>
    </>
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
        if (event.key === 'Enter' && !isImeComposingKey(event.nativeEvent)) {
          event.currentTarget.blur();
        }
      }}
      className="h-8 w-[220px] max-w-[220px] rounded-md border border-border bg-background px-2 text-sm text-foreground"
    />
  );
}
