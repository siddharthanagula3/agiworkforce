'use client';

import { useState } from 'react';
import { useBillingStore } from '@/stores/unified/auth';

export default function GeneralSettingsPage() {
  const user = useBillingStore((s) => s.user);
  const signOut = useBillingStore((s) => s.signOut);
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');

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
