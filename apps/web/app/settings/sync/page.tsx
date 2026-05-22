'use client';

/**
 * /settings/sync — Cross-device sync settings page.
 *
 * v1 LOCAL ONLY stance (ADR 2026-05-22): cross-surface chat sync is
 * waitlist-gated per locks/v1-local-only-cloud-waitlist-2026-05-18.md.
 * This page communicates the v1 position and lets users join the
 * Cloud Managed waitlist via POST /api/waitlist/cloud-managed.
 */

import { useState } from 'react';
import { getCsrfToken } from '@/lib/client/csrf';
import { useBillingStore } from '@/stores/unified/auth';

export default function SyncSettingsPage() {
  const user = useBillingStore((s) => s.user);

  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function joinWaitlist() {
    if (!user?.email) {
      setError('Sign in to join the waitlist.');
      return;
    }
    setJoining(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch('/api/waitlist/cloud-managed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ email: user.email, source: 'sync' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? 'Could not join waitlist. Please try again.',
        );
      }
      setJoined(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setJoining(false);
    }
  }

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

      {/* Cross-device sync — waitlist CTA */}
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
            {/* "Coming soon" badge — muted/outline style matching the page palette */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: 'var(--text-3)',
                border: '1px solid var(--border)',
                borderRadius: 9999,
                padding: '3px 10px',
                whiteSpace: 'nowrap',
                textTransform: 'uppercase',
              }}
            >
              Coming soon (Cloud Managed beta)
            </span>
          </div>

          {/* Help text */}
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
            v1 keeps your chat history local to each device. Cross-device sync is launching in Cloud
            Managed private beta — your conversations stay on-device until you opt in.
          </p>

          {/* Waitlist button or confirmation */}
          {joined ? (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: 'var(--teal, #14b8a6)',
                fontWeight: 600,
              }}
            >
              You are on the Cloud Managed waitlist. We will email you when access opens.
            </p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={joinWaitlist}
                disabled={joining}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#fff',
                  background: joining ? 'rgba(20,184,166,0.5)' : 'var(--teal, #14b8a6)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: joining ? 'not-allowed' : 'pointer',
                  opacity: joining ? 0.7 : 1,
                }}
              >
                {joining ? 'Joining...' : 'Join Cloud Managed waitlist'}
              </button>
              {error && (
                <span style={{ fontSize: 12, color: 'var(--terracotta, #da7756)' }}>{error}</span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Local-first guarantee note */}
      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
          v1 local-first guarantee
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
            Chat history on Web is stored in your account. Desktop and CLI store locally in SQLite.
          </li>
          <li style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
            No cross-surface sync happens unless you explicitly enable Cloud Managed.
          </li>
          <li style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
            Export your data at any time — see Privacy &amp; Data for JSON export.
          </li>
        </ul>
      </section>
    </div>
  );
}
