'use client';

import { useBillingStore } from '@/stores/unified/auth';
import { getSupabaseClient } from '@/services/supabase';
import { useState } from 'react';

/**
 * /settings/profile — display name + avatar surface. When the user is signed
 * in, the display name persists to Supabase `auth.users.user_metadata.full_name`
 * via `supabase.auth.updateUser`. When the user is unauthenticated (Local
 * Mode without sign-in), the value persists to localStorage as a device-local
 * fallback. Round-2 audit P0 #7 (web settings depth).
 */
export default function ProfileSettingsPage() {
  const user = useBillingStore((s) => s.user);
  const initialName =
    (user?.user_metadata?.['full_name'] as string | undefined) ??
    (user?.user_metadata?.['name'] as string | undefined) ??
    (typeof window !== 'undefined'
      ? (window.localStorage.getItem('agi.profile.displayName') ?? '')
      : '') ??
    user?.email?.split('@')[0] ??
    '';

  const [displayName, setDisplayName] = useState(initialName);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = displayName.trim();
    if (!trimmed) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Always update the local fallback so anonymous sessions still persist.
      window.localStorage.setItem('agi.profile.displayName', trimmed);

      if (user) {
        // Round-2 audit P0 #7 wire (2026-05-21): when authenticated, sync to
        // Supabase user_metadata so the value follows the account across
        // devices and is available to Cloud Managed downstream consumers.
        const supabase = getSupabaseClient();
        const { error } = await supabase.auth.updateUser({
          data: { full_name: trimmed },
        });
        if (error) {
          throw new Error(error.message);
        }
      }
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
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
          Profile
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          How the assistant refers to you. Stored on this device until cloud profile sync ships with
          Cloud Managed.
        </p>
      </div>

      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            aria-hidden="true"
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background:
                'linear-gradient(135deg, var(--chat-accent-primary, #da7756) 0%, var(--chat-accent-secondary, #21808d) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 600,
              fontSize: 20,
              textTransform: 'uppercase',
            }}
          >
            {(displayName || user?.email || 'A').slice(0, 1)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
              {user?.email ?? 'Not signed in'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Avatar customization arrives with Cloud Managed.
            </span>
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
            Display name
          </span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 80))}
            maxLength={80}
            placeholder="What should the assistant call you?"
            style={{
              fontSize: 14,
              padding: '8px 12px',
              background: 'var(--bg-base, #09090b)',
              color: 'var(--text-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
            }}
          />
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={displayName.trim().length === 0 || saving}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              background: 'var(--chat-accent-primary, #da7756)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: displayName.trim().length === 0 || saving ? 'not-allowed' : 'pointer',
              opacity: displayName.trim().length === 0 || saving ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {savedAt !== null && saveError === null && (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {user ? 'Synced to your account.' : 'Saved locally.'}
            </span>
          )}
          {saveError !== null && (
            <span style={{ fontSize: 12, color: 'var(--terracotta, #da7756)' }}>{saveError}</span>
          )}
        </div>
      </section>
    </div>
  );
}
