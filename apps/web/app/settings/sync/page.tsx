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
                fontSize: 12,
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
              Available
            </span>
          </div>

          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
            Personalization and notification preferences sync automatically between Web and Mobile
            whenever you&apos;re signed in to your AGI Cloud account — no request or opt-in step.
            Appearance, display language and chat preferences do NOT sync from Web today: they are
            stored on the device you set them on. Mobile additionally sends its own appearance and
            language settings, so a change made there will not appear here. Secrets (BYOK/provider
            keys, local model paths, device settings) never sync and stay on the device where you
            set them.
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
              Settings and chat history sync (Desktop Cloud)
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 12,
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
              Available
            </span>
          </div>

          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
            Desktop Cloud syncs chat history and allowlisted settings through your signed-in AGI
            Cloud account. Desktop Local and BYOK modes keep chat and settings on your machine by
            design and never join Cloud sync unless you explicitly switch to Desktop Cloud.
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
            Web, Mobile, and Desktop Cloud chat are account-bound. Desktop Local/BYOK and CLI keep
            local history on your machine.
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
