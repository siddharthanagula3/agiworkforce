'use client';

import { useEffect, useState } from 'react';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import { Switch } from '@agiworkforce/ui';
import { WebPushToggle } from '@/features/notifications';
import { toUserMessage } from '@/lib/user-error-message';

const NAMESPACE = 'notifications';

export type NotifKey = 'browserReplyReady' | 'mobilePushScheduleDone' | 'emailScheduleDone';

interface ChannelSpec {
  id: NotifKey;
  channel: string;
  description: string;
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
    channels: [
      {
        id: 'browserReplyReady',
        channel: 'Browser',
        description:
          'Shown as a desktop popup by your browser. Your browser asks for notification permission the first time.',
        defaultValue: true,
      },
    ],
  },
  {
    heading: 'Scheduled task finished',
    subheading:
      'A scheduled task completes or fails. Scheduled runs happen on the server while you are away, so this is the one result you cannot see in the app.',
    channels: [
      {
        id: 'emailScheduleDone',
        channel: 'Email',
        description:
          'Sent to the address on your account. It says what finished and links to the run, it never contains the task output.',
        defaultValue: false,
      },
      {
        id: 'mobilePushScheduleDone',
        channel: 'Mobile push',
        description: 'Sent to the AGI app on devices you have signed in on.',
        defaultValue: false,
      },
    ],
  },
];

const AGENT_RUN_HEADING = 'Agent run updates';
const AGENT_RUN_SUBHEADING =
  'An agent run finishes, fails, or needs your approval, including while the tab is closed.';
const BROWSER_SCOPE_NOTE =
  'This switch registers the browser you are using right now, so it is not saved to your account: turn it on again on each browser you want notified.';

function defaultNotificationState(): Record<NotifKey, boolean> {
  return EVENTS.flatMap((event) => event.channels).reduce(
    (acc, channel) => ({ ...acc, [channel.id]: channel.defaultValue }),
    {} as Record<NotifKey, boolean>,
  );
}

export function NotificationsSection() {
  const [state, setState] = useState<Record<NotifKey, boolean>>(() => defaultNotificationState());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchPreferenceNamespace<Record<NotifKey, boolean>>(NAMESPACE, defaultNotificationState())
      .then((value) => {
        if (!cancelled) {
          setState(value);
          setSaveError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSaveError(toUserMessage(error, 'Failed to load notifications'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(key: NotifKey) {
    setState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      setSaving(true);
      setSaveError(null);
      savePreferenceNamespace(NAMESPACE, next)
        .catch((error) => {
          setSaveError(toUserMessage(error, 'Failed to save notifications'));
        })
        .finally(() => setSaving(false));
      return next;
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 4px',
          }}
        >
          Notifications
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          When and how AGI reaches out. Each event below lists the channels that can deliver it.
          These preferences are loaded from and saved to your account settings.
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-3)' }} role="status">
          {loading
            ? 'Loading account settings...'
            : saving
              ? 'Saving...'
              : saveError
                ? `Save failed: ${saveError}`
                : 'Synced to your account'}
        </p>
      </div>

      <section
        aria-label="Notification channel availability"
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: '16px 20px',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
          Four channels have a sender
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-3)' }}>
          Browser replies and browser push for agent runs, plus scheduled-task results by email and
          mobile push, the toggles below are the complete list. Project, usage, billing, security,
          connector, tips, and marketing channels are not available. AGI does not save controls for
          notification senders that are not running.
        </p>
      </section>

      {EVENTS.map((event) => (
        <section
          key={event.heading}
          aria-label={event.heading}
          style={{
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-elev)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--settings-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
              {event.heading}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
              {event.subheading}
            </span>
          </div>

          {event.channels.map((spec, idx) => (
            <label
              key={spec.id}
              style={{
                padding: '14px 20px',
                borderTop: idx === 0 ? 'none' : '1px solid var(--settings-border)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 14,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
                  {spec.channel}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  {spec.description}
                </span>
              </div>
              <Switch
                aria-label={`${event.heading}, ${spec.channel}`}
                checked={state[spec.id]}
                onCheckedChange={() => toggle(spec.id)}
                style={{ marginTop: 2, flexShrink: 0 }}
              />
            </label>
          ))}
        </section>
      ))}

      <section
        aria-label={AGENT_RUN_HEADING}
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--settings-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
            {AGENT_RUN_HEADING}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
            {AGENT_RUN_SUBHEADING}
          </span>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <WebPushToggle />
          <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
            {BROWSER_SCOPE_NOTE}
          </span>
        </div>
      </section>
    </div>
  );
}
