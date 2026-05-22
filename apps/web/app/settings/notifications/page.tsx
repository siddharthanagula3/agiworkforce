'use client';

import { useState } from 'react';

/**
 * /settings/notifications — push + email notification preferences. Round-2
 * audit P0 #7 (web settings depth). Web stores prefs in localStorage in v1;
 * Cloud Managed mirrors them to the server so they propagate to mobile/
 * desktop without a re-toggle. Round-20 parity: reorganized into delivery
 * channel groups (Browser / Email / Mobile) with locked-with-tooltip for
 * channels that require Cloud Managed.
 */

// ─── Storage keys ─────────────────────────────────────────────────────────────

const NOTIF_KEYS = {
  // Browser / desktop
  browserReplyReady: 'agi.notifications.replyReady',
  browserAgentDone: 'agi.notifications.agentDone',
  // Email
  emailWeeklyDigest: 'agi.notifications.weeklyDigest',
  emailProductUpdates: 'agi.notifications.productUpdates',
  emailSecurityAlerts: 'agi.notifications.emailSecurityAlerts',
  // Mobile push (Cloud Managed)
  mobilePushReplyReady: 'agi.notifications.mobilePushReplyReady',
  mobilePushAgentDone: 'agi.notifications.mobilePushAgentDone',
} as const;

type NotifKey = keyof typeof NOTIF_KEYS;

interface NotifSpec {
  id: NotifKey;
  label: string;
  description: string;
  defaultValue: boolean;
  managedOnly?: boolean;
}

// ─── Channel groups ────────────────────────────────────────────────────────────

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
      {
        id: 'browserAgentDone',
        label: 'Agent task finished',
        description: 'Notify when a long-horizon agent task (Code mode, Cowork mode) finishes.',
        defaultValue: true,
      },
    ],
  },
  {
    heading: 'Email',
    subheading: 'Sent to your account email address. Cloud Managed only.',
    managedOnly: true,
    items: [
      {
        id: 'emailSecurityAlerts',
        label: 'Security alerts',
        description:
          'New sign-in from an unrecognized device or location. Always enabled for security.',
        defaultValue: true,
        managedOnly: true,
      },
      {
        id: 'emailWeeklyDigest',
        label: 'Weekly digest',
        description: 'Saturday recap of your conversations and routing decisions.',
        defaultValue: false,
        managedOnly: true,
      },
      {
        id: 'emailProductUpdates',
        label: 'Product updates',
        description:
          'Get an email when a major model or feature ships. Low-volume; you can unsubscribe anytime.',
        defaultValue: false,
        managedOnly: true,
      },
    ],
  },
  {
    heading: 'Mobile push',
    subheading: 'Requires the AGI mobile app and Cloud Managed.',
    managedOnly: true,
    items: [
      {
        id: 'mobilePushReplyReady',
        label: 'Reply ready',
        description: 'Push notification on your phone when a response finishes.',
        defaultValue: false,
        managedOnly: true,
      },
      {
        id: 'mobilePushAgentDone',
        label: 'Agent task finished',
        description: 'Push notification when a background agent task completes.',
        defaultValue: false,
        managedOnly: true,
      },
    ],
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function readNotif(key: NotifKey, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue;
  const stored = window.localStorage.getItem(NOTIF_KEYS[key]);
  if (stored === '1') return true;
  if (stored === '0') return false;
  return defaultValue;
}

function writeNotif(key: NotifKey, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NOTIF_KEYS[key], value ? '1' : '0');
  } catch {
    // Non-fatal in private windows.
  }
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function NotificationsSettingsPage() {
  const allKeys = CHANNEL_GROUPS.flatMap((g) => g.items).map((s) => s.id);

  const [state, setState] = useState<Record<NotifKey, boolean>>(() =>
    CHANNEL_GROUPS.flatMap((g) => g.items).reduce(
      (acc, t) => ({ ...acc, [t.id]: readNotif(t.id, t.defaultValue) }),
      {} as Record<NotifKey, boolean>,
    ),
  );

  // Keep TS happy
  void allKeys;

  function toggle(key: NotifKey, disabled?: boolean) {
    if (disabled) return;
    setState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeNotif(key, next[key]);
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
          When and how AGI reaches out. Browser prefs apply to this device only.
        </p>
      </div>

      {CHANNEL_GROUPS.map((group) => (
        <section
          key={group.heading}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-elev)',
            overflow: 'hidden',
          }}
        >
          {/* Group header */}
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--border)',
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
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                  }}
                >
                  Cloud Managed
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{group.subheading}</span>
          </div>

          {/* Items */}
          {group.items.map((spec, idx) => (
            <label
              key={spec.id}
              title={spec.managedOnly ? 'Available with Cloud Managed' : undefined}
              style={{
                padding: '14px 20px',
                borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                cursor: spec.managedOnly ? 'not-allowed' : 'pointer',
                opacity: spec.managedOnly ? 0.55 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={state[spec.id]}
                disabled={spec.managedOnly}
                onChange={() => toggle(spec.id, spec.managedOnly)}
                style={{ marginTop: 2, flexShrink: 0 }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                  {spec.label}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  {spec.description}
                </span>
              </div>
            </label>
          ))}
        </section>
      ))}
    </div>
  );
}
