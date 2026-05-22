'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useBillingStore } from '@/stores/unified/auth';

export default function GeneralSettingsPage() {
  const user = useBillingStore((s) => s.user);
  const signOut = useBillingStore((s) => s.signOut);

  // Round-2 audit P0 #7 wire-up (2026-05-21) — replaces the previous local
  // `useState` that never persisted theme choices across reloads. next-themes
  // is already wired through shared/components/ThemeProvider in app/providers,
  // so this hook is the canonical read/write surface for theme persistence.
  const { theme: nextTheme, setTheme: setNextTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch — render the SSR default ("dark") on the server
  // and only switch to the persisted value once mounted on the client.
  const selectedTheme =
    !mounted || !nextTheme ? 'dark' : (nextTheme as 'dark' | 'light' | 'system');
  const theme = selectedTheme;
  function setTheme(next: 'dark' | 'light' | 'system') {
    setNextTheme(next);
  }
  void resolvedTheme; // surfaced via the data-theme attribute by ThemeProvider

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
          General
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Account and interface preferences.
        </p>
      </div>

      {/* Account */}
      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Account
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Row label="Email">
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{user?.email ?? '-'}</span>
          </Row>
          <Row label="User ID">
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-3)',
                fontFamily: 'var(--mono)',
              }}
            >
              {user?.id ?? '-'}
            </span>
          </Row>
        </div>
      </section>

      {/* Appearance */}
      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Appearance
        </div>
        <div style={{ padding: '16px 20px' }}>
          <Row label="Theme">
            <div style={{ display: 'flex', gap: 4 }}>
              {(['dark', 'light', 'system'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  style={{
                    padding: '5px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    background: theme === t ? 'var(--teal)' : 'transparent',
                    color: theme === t ? '#fff' : 'var(--text-2)',
                    fontSize: 13,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </Row>
        </div>
      </section>

      {/* Danger zone */}
      <section
        style={{
          border: '1px solid rgba(218,119,86,0.4)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid rgba(218,119,86,0.4)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--terracotta)',
          }}
        >
          Sign out
        </div>
        <div style={{ padding: '16px 20px' }}>
          <button
            onClick={signOut}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'transparent',
              color: 'var(--text-2)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Sign out of this account
          </button>
        </div>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        minHeight: 32,
      }}
    >
      <span style={{ fontSize: 14, color: 'var(--text-3)', flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}
