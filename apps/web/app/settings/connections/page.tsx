'use client';

import { formatPrivacyModeLabel } from '@agiworkforce/types';

/**
 * /settings/connections — OAuth-backed connectors (Google Drive, GitHub, Slack…)
 * Cloud Managed only — waitlisted in v1. Round-2 audit P0 #7 (web settings
 * depth). Page renders locked/private-beta state per the goal contract; the
 * underlying contract is in @agiworkforce/types so wire-up activates when the
 * waitlist opens.
 */

const CONNECTORS: ReadonlyArray<{ id: string; label: string; description: string }> = [
  {
    id: 'google-drive',
    label: 'Google Drive',
    description: 'Read documents, sheets, and slides into chat context.',
  },
  {
    id: 'github',
    label: 'GitHub',
    description: 'Browse repos, issues, and PRs; attach code to messages.',
  },
  {
    id: 'slack',
    label: 'Slack',
    description: 'Search channels and DMs; summarize threads.',
  },
  {
    id: 'gmail',
    label: 'Gmail',
    description: 'Read recent threads; draft replies.',
  },
  {
    id: 'calendar',
    label: 'Google Calendar',
    description: 'Check availability; draft event invites.',
  },
  {
    id: 'notion',
    label: 'Notion',
    description: 'Search workspace and attach pages.',
  },
];

const managedLabel = formatPrivacyModeLabel('managed');

export default function ConnectionsSettingsPage() {
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
          Connections
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          External services the assistant can read on your behalf. Cloud Managed only — local-mode
          and BYOK installs use MCP connectors instead (see Capabilities → MCP).
        </p>
      </div>

      <div
        role="status"
        style={{
          border: '1px dashed var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: '14px 18px',
          fontSize: 13,
          color: 'var(--text-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span aria-hidden="true">🔒</span>
        OAuth connectors are part of the {managedLabel} waitlist. Listed here so you can see what
        will arrive when the private beta opens.
      </div>

      <section
        aria-label="Available connectors"
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        {CONNECTORS.map((connector, idx) => (
          <div
            key={connector.id}
            style={{
              padding: '14px 18px',
              borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                {connector.label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{connector.description}</span>
            </div>
            <button
              type="button"
              disabled
              aria-label={`${connector.label} — waitlist required`}
              style={{
                padding: '5px 12px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-3)',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'not-allowed',
                opacity: 0.7,
              }}
            >
              Waitlist
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
