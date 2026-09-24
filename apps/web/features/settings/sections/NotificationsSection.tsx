'use client';

import { useEffect, useRef, useState } from 'react';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import { Switch } from '@agiworkforce/ui';
import { useWebPushToggle } from '@/features/notifications';
import { toUserMessage } from '@/lib/user-error-message';
import { SaveStatusLine } from '../components/SaveStatusLine';

const NAMESPACE = 'notifications';

export type NotifKey = 'browserReplyReady' | 'mobilePushScheduleDone' | 'emailScheduleDone';

interface ChannelSpec {
  id: NotifKey;
  channel: string;
  defaultValue: boolean;
}

interface EventSpec {
  heading: string;
  subheading: string;
  channels: ChannelSpec[];
}

const EVENTS: ReadonlyArray<EventSpec> = [
  {
    heading: 'Reply ready',
    subheading: 'A long-running response finishes while the AGI tab is in the background.',
    channels: [{ id: 'browserReplyReady', channel: 'Browser', defaultValue: true }],
  },
  {
    heading: 'Scheduled task finished',
    subheading:
      'A scheduled task completes or fails. Scheduled runs happen on the server while you are away, so this is the one result you cannot see in the app.',
    channels: [
      { id: 'emailScheduleDone', channel: 'Email', defaultValue: false },
      { id: 'mobilePushScheduleDone', channel: 'Mobile push', defaultValue: false },
    ],
  },
];

const AGENT_RUN_HEADING = 'Agent run updates';
const AGENT_RUN_SCOPE_NOTE =
  'Applies only to this browser, so turn it on again wherever else you want notified.';

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

export function NotificationsSection() {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
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

      <div>
        {EVENTS.map((event) => {
          const options = channelOptions(event);
          const selectedIds = event.channels
            .filter((channel) => state[channel.id])
            .map((channel) => channel.id);
          const value = selectedIds.length === 0 ? OFF_VALUE : selectedIds.join(CHANNEL_SEPARATOR);

          return (
            <section
              key={event.heading}
              aria-label={event.heading}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-4)',
                padding: 'var(--space-4) 0',
                borderBottom: '1px solid var(--settings-border)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0, maxWidth: 480 }}>
                <div style={{ fontSize: 14, color: 'var(--text-1)' }}>{event.heading}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
                  {event.subheading}
                </div>
              </div>
              <select
                aria-label={event.heading}
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

        <AgentRunRow />
      </div>
    </div>
  );
}

function AgentRunRow() {
  const { checked, disabled, unavailable, description, onCheckedChange } = useWebPushToggle();

  return (
    <section
      aria-label={AGENT_RUN_HEADING}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        padding: 'var(--space-4) 0',
      }}
    >
      <div style={{ minWidth: 0, maxWidth: 480 }}>
        <div style={{ fontSize: 14, color: 'var(--text-1)' }}>{AGENT_RUN_HEADING}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
          {unavailable ? description : AGENT_RUN_SCOPE_NOTE}
        </div>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={AGENT_RUN_HEADING}
      />
    </section>
  );
}
