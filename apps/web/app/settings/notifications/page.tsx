'use client';

import { useState } from 'react';

/**
 * /settings/notifications — push + email notification preferences. Round-2
 * audit P0 #7 (web settings depth). Web stores prefs in localStorage in v1;
 * Cloud Managed mirrors them to the server so they propagate to mobile/
 * desktop without a re-toggle.
 */

const NOTIFICATION_KEYS = {
  replyReady: 'agi.notifications.replyReady',
  agentDone: 'agi.notifications.agentDone',
  weeklyDigest: 'agi.notifications.weeklyDigest',
  productUpdates: 'agi.notifications.productUpdates',
} as const;

type ToggleKey = keyof typeof NOTIFICATION_KEYS;

interface ToggleSpec {
  id: ToggleKey;
  label: string;
  description: string;
  defaultValue: boolean;
  managedOnly?: boolean;
}

const TOGGLES: ReadonlyArray<ToggleSpec> = [
  {
    id: 'replyReady',
    label: 'Reply ready',
    description:
      'Browser notification when a long-running response finishes while the tab is in the background.',
    defaultValue: true,
  },
  {
    id: 'agentDone',
    label: 'Agent task finished',
    description: 'Notify when a long-horizon agent task (Code mode, Cowork mode) finishes.',
    defaultValue: true,
  },
  {
    id: 'weeklyDigest',
    label: 'Weekly digest email',
    description: 'Saturday recap of your conversations and routing decisions. Cloud Managed only.',
    defaultValue: false,
    managedOnly: true,
  },
  {
    id: 'productUpdates',
    label: 'Product updates',
    description:
      'Get an email when a major model or feature ships. Low-volume; you can unsubscribe anytime.',
    defaultValue: false,
    managedOnly: true,
  },
];

function readToggle(key: ToggleKey, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue;
  const stored = window.localStorage.getItem(NOTIFICATION_KEYS[key]);
  if (stored === '1') return true;
  if (stored === '0') return false;
  return defaultValue;
}

function writeToggle(key: ToggleKey, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NOTIFICATION_KEYS[key], value ? '1' : '0');
  } catch {
    // Non-fatal in private windows.
  }
}

export default function NotificationsSettingsPage() {
  const [state, setState] = useState<Record<ToggleKey, boolean>>(() =>
    TOGGLES.reduce(
      (acc, t) => ({ ...acc, [t.id]: readToggle(t.id, t.defaultValue) }),
      {} as Record<ToggleKey, boolean>,
    ),
  );

  function toggle(key: ToggleKey) {
    setState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeToggle(key, next[key]);
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
          When and how AGI Workforce reaches out. Browser-level prefs apply to this device only.
        </p>
      </div>

      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        {TOGGLES.map((spec, idx) => (
          <label
            key={spec.id}
            style={{
              padding: '16px 20px',
              borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              cursor: spec.managedOnly ? 'not-allowed' : 'pointer',
              opacity: spec.managedOnly ? 0.65 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={state[spec.id]}
              disabled={spec.managedOnly}
              onChange={() => toggle(spec.id)}
              style={{ marginTop: 3 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                {spec.label}
                {spec.managedOnly ? (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--text-3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Cloud Managed
                  </span>
                ) : null}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                {spec.description}
              </span>
            </div>
          </label>
        ))}
      </section>
    </div>
  );
}
