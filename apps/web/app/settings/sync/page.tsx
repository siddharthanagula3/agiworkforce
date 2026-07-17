/**
 * /settings/sync · Cross-device sync settings page.
 *
 * Managed cloud is public alpha and open by default (founder decision,
 * 2026-06-27, AGENTS.md) — there is no waitlist/request-access step for sync
 * itself. Settings sync (/api/settings/sync, a cloud-safe namespace allowlist)
 * and mobile chat-history sync (/api/chat/sync) are both live today for any
 * signed-in AGI Cloud account; this page previously showed a "request hosted
 * sync access" waitlist form for that already-live capability. The one piece
 * that is genuinely not available yet is Desktop cloud persistence (chat and
 * settings both) — Desktop Local/BYOK modes keep history device-local by
 * design, and Desktop's Cloud app mode has no sync wiring yet (tracked gap,
 * not a waitlist).
 */

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
          Cross-device chat history and settings sync for your AGI Cloud account.
        </p>
      </div>

      {/* Cross-device sync · live status */}
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
          {/* Row: Settings + chat sync status */}
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
              Settings and chat history sync (Web, Mobile)
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
              Live
            </span>
          </div>

          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
            Appearance, personalization, notifications, language, and chat preferences sync
            automatically across Web and Mobile whenever you&apos;re signed in to your AGI Cloud
            account — no request or opt-in step. Secrets (BYOK/provider keys, local model paths,
            device settings) never sync and stay on the device where you set them.
          </p>

          {/* Row: Desktop status */}
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
              Settings and chat history sync (Desktop)
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
              Coming soon
            </span>
          </div>

          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
            Desktop Local and BYOK modes keep chat and settings on your machine by design. Desktop
            cloud sync isn&apos;t wired up yet — Desktop stays local-only for now, independent of
            your Web/Mobile sync state.
          </p>
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
            Secret and device-specific settings (BYOK keys, local model paths, device config) never
            sync, on any surface.
          </li>
          <li style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
            Export your data at any time. See Privacy &amp; Data for JSON export.
          </li>
        </ul>
      </section>
    </div>
  );
}
