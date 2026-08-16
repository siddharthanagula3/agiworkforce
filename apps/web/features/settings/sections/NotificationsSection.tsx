'use client';

import { useEffect, useState } from 'react';
import { useBillingStore } from '@shared/stores/web-auth-store';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import { Switch } from '@agiworkforce/ui';

const NAMESPACE = 'notifications';

export type NotifKey = 'browserReplyReady' | 'mobilePushScheduleDone' | 'emailScheduleDone';

interface NotifSpec {
  id: NotifKey;
  label: string;
  description: string;
  defaultValue: boolean;
  managedOnly?: boolean;
}

interface ChannelGroup {
  heading: string;
  subheading: string;
  managedOnly?: boolean;
  items: NotifSpec[];
}

const CHANNEL_GROUPS: ReadonlyArray<ChannelGroup> = [
  {
    heading: 'Browser notifications',
    subheading: 'Shown as desktop popups when the AGI tab is in the background.',
    items: [
      {
        id: 'browserReplyReady',
        label: 'Reply ready',
        description:
          'Browser notification when a long-running response finishes while the tab is in the background.',
        defaultValue: true,
      },
    ],
  },
  {
    heading: 'Email',
    subheading: 'Sent to the address on your account.',
    items: [
      {
        id: 'emailScheduleDone',
        label: 'Scheduled task finished',
        description:
          'Email when one of your scheduled tasks completes or fails. The email says what finished and links to the run — it never contains the task output.',
        defaultValue: false,
      },
    ],
  },
  {
    heading: 'Mobile push',
    subheading: 'Sent to the AGI app on devices you have signed in on.',
    items: [
      {
        id: 'mobilePushScheduleDone',
        label: 'Scheduled task finished',
        description:
          'Push notification when one of your scheduled tasks completes or fails. Scheduled runs happen on the server while you are away, so this is the one result you cannot see in the app.',
        defaultValue: false,
      },
    ],
  },
];

function defaultNotificationState(): Record<NotifKey, boolean> {
  return CHANNEL_GROUPS.flatMap((g) => g.items).reduce(
    (acc, t) => ({ ...acc, [t.id]: t.defaultValue }),
    {} as Record<NotifKey, boolean>,
  );
}

export function NotificationsSection() {
  const subscription = useBillingStore((s) => s.subscription);
  const hasHostedCloud = subscription?.status === 'active' && subscription.tier !== 'free';
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
          setSaveError(error instanceof Error ? error.message : 'Failed to load notifications');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(key: NotifKey, disabled?: boolean) {
    if (disabled) return;
    setState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      setSaving(true);
      setSaveError(null);
      savePreferenceNamespace(NAMESPACE, next)
        .catch((error) => {
          setSaveError(error instanceof Error ? error.message : 'Failed to save notifications');
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
            fontFamily: 'var(--serif)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 4px',
          }}
        >
          Notifications
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          When and how AGI reaches out. These preferences are loaded from and saved to your account
          settings.
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
          Three channels have a sender
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-3)' }}>
          Browser replies, plus scheduled-task results by email and mobile push — the toggles below
          are the complete list. Project, usage, billing, security, connector, tips, and marketing
          channels are not available. AGI does not save controls for notification senders that are
          not running.
        </p>
      </section>

      {CHANNEL_GROUPS.map((group) => (
        <section
          key={group.heading}
          style={{
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-elev)',
            overflow: 'hidden',
          }}
        >
          {/* Group header */}
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--settings-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                {group.heading}
              </span>
              {group.managedOnly && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--text-3)',
                    padding: '2px 6px',
                    border: '1px solid var(--settings-border)',
                    borderRadius: 4,
                  }}
                >
                  {hasHostedCloud ? 'Hosted cloud' : 'Upgrade'}
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{group.subheading}</span>
          </div>

          {/* Items */}
          {group.items.map((spec, idx) => (
            <label
              key={spec.id}
              title={
                spec.managedOnly && !hasHostedCloud
                  ? 'Available with hosted cloud upgrades'
                  : undefined
              }
              style={{
                padding: '14px 20px',
                borderTop: idx === 0 ? 'none' : '1px solid var(--settings-border)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 14,
                cursor: spec.managedOnly && !hasHostedCloud ? 'not-allowed' : 'pointer',
                opacity: spec.managedOnly && !hasHostedCloud ? 0.55 : 1,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                  {spec.label}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  {spec.description}
                </span>
              </div>
              <Switch
                checked={state[spec.id]}
                disabled={spec.managedOnly && !hasHostedCloud}
                onCheckedChange={() => toggle(spec.id, spec.managedOnly && !hasHostedCloud)}
                style={{ marginTop: 2, flexShrink: 0 }}
              />
            </label>
          ))}
        </section>
      ))}
    </div>
  );
}
