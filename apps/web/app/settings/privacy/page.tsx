'use client';

import { useState } from 'react';

/**
 * /settings/privacy — local-first privacy controls. Round-2 audit P0 #7 (web
 * settings depth). All toggles persist in localStorage in v1; Cloud Managed
 * replaces persistence with a Supabase row but the contract here stays the
 * same so the wire-up is a delta.
 */

const PRIVACY_KEYS = {
  improveModelTraining: 'agi.privacy.improveModelTraining',
  shareTelemetry: 'agi.privacy.shareTelemetry',
  rememberChats: 'agi.privacy.rememberChats',
} as const;

type ToggleKey = keyof typeof PRIVACY_KEYS;

interface ToggleSpec {
  id: ToggleKey;
  label: string;
  description: string;
  defaultValue: boolean;
  managedOnly?: boolean;
}

const TOGGLES: ReadonlyArray<ToggleSpec> = [
  {
    id: 'rememberChats',
    label: 'Remember chats',
    description:
      'When enabled, conversations are saved on this device and synced to Web, Desktop, and Mobile (never CLI / VS Code / Chrome extension). Turn off to use chat in ephemeral mode only.',
    defaultValue: true,
  },
  {
    id: 'improveModelTraining',
    label: 'Help improve AGI models',
    description:
      'Cloud Managed only — share anonymized conversations to improve future models. Off by default. Local Mode and BYOK conversations are never used regardless of this setting.',
    defaultValue: false,
    managedOnly: true,
  },
  {
    id: 'shareTelemetry',
    label: 'Share crash and usage telemetry',
    description:
      'Send anonymized error reports and usage counts (no message content) so we can fix bugs faster. Stripped before send via the Sentry beforeSend hook.',
    defaultValue: false,
  },
];

function readToggle(key: ToggleKey, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue;
  const stored = window.localStorage.getItem(PRIVACY_KEYS[key]);
  if (stored === '1') return true;
  if (stored === '0') return false;
  return defaultValue;
}

function writeToggle(key: ToggleKey, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PRIVACY_KEYS[key], value ? '1' : '0');
  } catch {
    // Private-window / quota errors are non-fatal.
  }
}

export default function PrivacySettingsPage() {
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
          Privacy & data controls
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          AGI Workforce is local-first. These toggles override defaults for this device.
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

      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
          Export your data
        </h2>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
          Download all your conversations as JSON. Available locally; Cloud Managed adds server-side
          archive export.
        </p>
        <button
          type="button"
          disabled
          style={{
            alignSelf: 'flex-start',
            marginTop: 6,
            padding: '6px 12px',
            fontSize: 12,
            color: 'var(--text-3)',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            cursor: 'not-allowed',
          }}
        >
          Export — coming soon
        </button>
      </section>
    </div>
  );
}
