'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import { Switch } from '@agiworkforce/ui';
import { BrowserNotificationStatus, useWebPushToggle } from '@/features/notifications';
import {
  isReleased,
  SURFACE_STATUS,
  type SurfaceId,
  type SurfaceStatusMap,
} from '@/lib/surface-status';
import { toUserMessage } from '@/lib/user-error-message';
import { SaveStatusLine } from '../components/SaveStatusLine';
import { SettingsPageLink } from '../components/SettingsSectionLink';
import styles from './NotificationsSection.module.css';

const NAMESPACE = 'notifications';

export type NotifKey =
  | 'browserReplyReady'
  | 'mobilePushScheduleDone'
  | 'emailScheduleDone'
  | 'emailSecurityAlerts'
  | 'pushUsageReset';

interface ChannelSpec {
  id: NotifKey;
  channel: string;
  defaultValue: boolean;
  surface?: SurfaceId;
  browserDependent?: boolean;
}

interface EventSpec {
  heading: string;
  subheading: string;
  detail?: string;
  channels: ChannelSpec[];
  link?: { label: string; href: string };
}

const EVENTS: ReadonlyArray<EventSpec> = [
  {
    heading: 'Reply ready',
    subheading: 'When a reply finishes while this tab is in the background.',
    channels: [
      { id: 'browserReplyReady', channel: 'Browser', defaultValue: true, browserDependent: true },
    ],
  },
  {
    heading: 'Scheduled task finished',
    subheading: 'When a scheduled task completes or fails.',
    detail: 'Runs continue on the server while you are away. Results remain available in Tasks.',
    channels: [
      { id: 'emailScheduleDone', channel: 'Email', defaultValue: true },
      {
        id: 'mobilePushScheduleDone',
        channel: 'Mobile push',
        defaultValue: true,
        surface: 'mobile',
      },
    ],
    link: { label: 'Manage tasks', href: '/tasks' },
  },
  {
    heading: 'Security alerts',
    subheading: 'Always shown in-app, including quiet hours.',
    detail:
      'Includes sign-in, password, email, two-factor and device changes. Security alerts are sent during quiet hours. Email is optional unless Advanced Account Security requires it.',
    channels: [{ id: 'emailSecurityAlerts', channel: 'Email', defaultValue: true }],
  },
  {
    heading: 'Usage',
    subheading: 'Usage-limit resets on registered browsers and mobile devices.',
    channels: [
      { id: 'pushUsageReset', channel: 'Push', defaultValue: true, browserDependent: true },
    ],
  },
];

const AGENT_RUN_HEADING = 'Agent run updates';
const AGENT_RUN_SCOPE_NOTE = 'Completions, failures and approval requests. This browser only.';

const OFF_VALUE = 'off';
const CHANNEL_SEPARATOR = '+';

interface ChannelOption {
  value: string;
  label: string;
  ids: NotifKey[];
}

/**
 * Every non-empty combination of an event's channels, plus Off. An event
 * with two independently toggleable channels (Email, Mobile push) keeps
 * every state the old per-channel switches could reach, including both at
 * once, as one option in a single select instead of two switches.
 */
function channelOptions(event: EventSpec): ChannelOption[] {
  const combinations: NotifKey[][] = [];
  for (let mask = 1; mask < 1 << event.channels.length; mask++) {
    combinations.push(
      event.channels.filter((_, index) => (mask & (1 << index)) !== 0).map((c) => c.id),
    );
  }
  return [
    { value: OFF_VALUE, label: 'Off', ids: [] },
    ...combinations.map((ids) => ({
      value: ids.join(CHANNEL_SEPARATOR),
      label: ids
        .map((id) => event.channels.find((channel) => channel.id === id)?.channel ?? id)
        .join(', '),
      ids,
    })),
  ];
}

function offeredEvents(statuses: SurfaceStatusMap): EventSpec[] {
  return EVENTS.map((event) => ({
    ...event,
    channels: event.channels.filter(
      (channel) => !channel.surface || isReleased(channel.surface, statuses),
    ),
  }));
}

function defaultNotificationState(): Record<NotifKey, boolean> {
  return EVENTS.flatMap((event) => event.channels).reduce(
    (acc, channel) => ({ ...acc, [channel.id]: channel.defaultValue }),
    {} as Record<NotifKey, boolean>,
  );
}

const SELECT_STYLE = {
  height: 32,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--settings-border)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  fontSize: 13,
  padding: '0 var(--space-2)',
} as const;

export function NotificationsSection({
  surfaceStatus = SURFACE_STATUS,
}: {
  surfaceStatus?: SurfaceStatusMap;
} = {}) {
  const browserStatusId = useId();
  const [state, setState] = useState<Record<NotifKey, boolean>>(() => defaultNotificationState());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasChanged, setHasChanged] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [failedChange, setFailedChange] = useState<Record<NotifKey, boolean> | null>(null);
  const saveInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSaveError(null);
    fetchPreferenceNamespace<Record<NotifKey, boolean>>(NAMESPACE, defaultNotificationState())
      .then((value) => {
        if (!cancelled) {
          setState({ ...defaultNotificationState(), ...value });
          setLoadError(false);
          setSaveError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(true);
          setSaveError(toUserMessage(error, 'Failed to load notifications'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  async function saveChange(next: Record<NotifKey, boolean>) {
    if (loading || loadError || saveInFlight.current) return;
    saveInFlight.current = true;
    const previous = state;
    setState(next);
    setSaving(true);
    setSaveError(null);
    setFailedChange(null);
    try {
      await savePreferenceNamespace(NAMESPACE, next);
      setHasChanged(true);
    } catch (error) {
      setState(previous);
      setFailedChange(next);
      setSaveError(toUserMessage(error, 'Your notification preferences could not be saved.'));
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  function setEventChannels(event: EventSpec, enabledIds: NotifKey[]) {
    const next = { ...state };
    for (const channel of event.channels) {
      next[channel.id] = enabledIds.includes(channel.id);
    }
    void saveChange(next);
  }

  return (
    <div
      data-testid="notification-preferences"
      className={styles['content']}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
    >
      <div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 var(--space-1)',
          }}
        >
          Notifications
        </h1>
        {loading || saving || saveError || hasChanged ? (
          <SaveStatusLine
            failed={saveError !== null}
            style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}
          >
            {loading
              ? 'Loading account settings...'
              : saving
                ? 'Saving...'
                : saveError
                  ? `${loadError ? 'Could not load preferences' : 'Changes were not saved'}: ${saveError}`
                  : 'Saved'}
          </SaveStatusLine>
        ) : null}
        {saveError && !loading && !saving ? (
          <button
            type="button"
            className="text-sm underline underline-offset-4"
            onClick={() => {
              if (loadError) {
                setLoading(true);
                setLoadAttempt((attempt) => attempt + 1);
              } else if (failedChange) {
                void saveChange(failedChange);
              }
            }}
          >
            {loadError ? 'Retry loading' : 'Retry saving'}
          </button>
        ) : null}
      </div>

      <BrowserNotificationStatus id={browserStatusId} />

      <div className={styles['rows']}>
        {offeredEvents(surfaceStatus).map((event, index) => {
          const options = channelOptions(event);
          const selectedIds = event.channels
            .filter((channel) => state[channel.id])
            .map((channel) => channel.id);
          const value = selectedIds.length === 0 ? OFF_VALUE : selectedIds.join(CHANNEL_SEPARATOR);

          return (
            <section key={event.heading} aria-label={event.heading} className={styles['row']}>
              <div data-testid="notification-description" className={styles['description']}>
                <div style={{ fontSize: 14, color: 'var(--text-1)' }}>{event.heading}</div>
                <div
                  id={`${browserStatusId}-description-${index}`}
                  style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}
                >
                  {event.subheading}
                </div>
                {event.detail ? (
                  <details
                    style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-2)' }}
                  >
                    <summary className="cursor-pointer text-[var(--text-1)]">
                      Delivery details
                    </summary>
                    <p style={{ margin: 'var(--space-1) 0 0' }}>{event.detail}</p>
                  </details>
                ) : null}
                {event.link ? (
                  <SettingsPageLink
                    href={event.link.href}
                    className="underline underline-offset-4"
                    style={{
                      display: 'inline-block',
                      fontSize: 14,
                      color: 'var(--text-1)',
                      marginTop: 'var(--space-1)',
                    }}
                  >
                    {event.link.label}
                  </SettingsPageLink>
                ) : null}
              </div>
              <select
                aria-label={event.heading}
                aria-describedby={`${browserStatusId}-description-${index}${event.channels.some((channel) => channel.browserDependent) ? ` ${browserStatusId}` : ''}`}
                className={`${styles['control']} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                data-notification-control
                disabled={loading || saving || loadError}
                value={value}
                onChange={(changeEvent) => {
                  const option = options.find((o) => o.value === changeEvent.target.value);
                  if (option) setEventChannels(event, option.ids);
                }}
                style={SELECT_STYLE}
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </section>
          );
        })}

        <AgentRunRow browserStatusId={browserStatusId} />
      </div>
    </div>
  );
}

function AgentRunRow({ browserStatusId }: { browserStatusId: string }) {
  const { checked, disabled, unavailable, description, onCheckedChange } = useWebPushToggle();

  return (
    <section aria-label={AGENT_RUN_HEADING} className={styles['row']}>
      <div className={styles['description']}>
        <div style={{ fontSize: 14, color: 'var(--text-1)' }}>{AGENT_RUN_HEADING}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
          {unavailable ? description : AGENT_RUN_SCOPE_NOTE}
        </div>
        <details style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-2)' }}>
          <summary className="cursor-pointer text-[var(--text-1)]">Delivery details</summary>
          <p style={{ margin: 'var(--space-1) 0 0' }}>
            Enable separately in each browser. Alerts show run status, not run output.
          </p>
        </details>
      </div>
      <div className={`${styles['control']} ${styles['switchControl']}`} data-notification-control>
        <Switch
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
          aria-label={AGENT_RUN_HEADING}
          aria-describedby={browserStatusId}
        />
      </div>
    </section>
  );
}
