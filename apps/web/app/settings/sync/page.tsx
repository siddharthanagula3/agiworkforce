/**
 * /settings/sync · Cross-device sync settings page.
 *
 * Cross-surface sync is a hosted cloud capability. Keep local/account modes
 * clear and reuse the shared account-bound access request form.
 */

import { WaitlistForm } from '../../byok/WaitlistForm';

export default function SyncSettingsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Header */}
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
          Sync
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Cross-device chat history and settings sync.
        </p>
      </div>

      {/* Cross-device sync · hosted cloud upgrade CTA */}
      <section
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
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Cross-device sync
        </div>
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Row: Chat history sync status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              minHeight: 32,
            }}
          >
            <span style={{ fontSize: 14, color: 'var(--text-3)', flexShrink: 0 }}>
              Chat history sync (Web, Desktop, Mobile)
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: 'var(--text-3)',
                border: '1px solid var(--settings-border)',
                borderRadius: 9999,
                padding: '3px 10px',
                whiteSpace: 'nowrap',
                textTransform: 'uppercase',
              }}
            >
              Hosted cloud upgrade
            </span>
          </div>

          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
            Chat history stays local or account-scoped until you enable hosted cloud sync. Request
            access if you want AGI to sync conversations across Web, Desktop, Mobile, and CLI.
          </p>

          <WaitlistForm source="sync" ctaLabel="Request hosted sync access" />
        </div>
      </section>

      {/* Local/account guarantee note */}
      <section
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
          Local and account modes
        </h2>
        <ul
          style={{
            margin: 0,
            padding: '0 0 0 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <li style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
            Website chat is account-bound. Desktop and CLI keep local history on your machine.
          </li>
          <li style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
            No cross-surface sync happens unless you explicitly enable hosted cloud sync.
          </li>
          <li style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
            Export your data at any time. See Privacy &amp; Data for JSON export.
          </li>
        </ul>
      </section>
    </div>
  );
}
