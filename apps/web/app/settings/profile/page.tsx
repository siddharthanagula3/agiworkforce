'use client';

import { useBillingStore } from '@/stores/unified/auth';
import { getSupabaseClient } from '@/services/supabase';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/**
 * /settings/profile — display name, persona context, appearance. When signed
 * in, display name and persona fields persist to Supabase user_metadata. Theme
 * persists via next-themes (next-themes ThemeProvider is wired at app root).
 * Round-20 parity pass: added persona fields + theme dropdown to match Claude
 * desktop profile panel IA.
 */

const WORK_DESCRIPTIONS = [
  'Software engineering',
  'Data science / ML',
  'Product management',
  'Design / UX',
  'Marketing',
  'Sales / Business development',
  'Legal / Compliance',
  'Finance / Accounting',
  'Operations',
  'Research / Academia',
  'Writing / Content',
  'Healthcare',
  'Education',
  'Other',
] as const;

type WorkDescription = (typeof WORK_DESCRIPTIONS)[number] | '';

const LS_PREFERRED_NAME_KEY = 'agi.profile.preferredName';
const LS_WORK_KEY = 'agi.profile.workDescription';
const LS_INSTRUCTIONS_KEY = 'agi.profile.instructions';

export default function ProfileSettingsPage() {
  const user = useBillingStore((s) => s.user);

  const initialFullName =
    (user?.user_metadata?.['full_name'] as string | undefined) ??
    (user?.user_metadata?.['name'] as string | undefined) ??
    (typeof window !== 'undefined'
      ? (window.localStorage.getItem('agi.profile.displayName') ?? '')
      : '') ??
    user?.email?.split('@')[0] ??
    '';

  // Full legal name (used for billing, display in account panels).
  const [displayName, setDisplayName] = useState(initialFullName);

  // Preferred name: what the assistant calls you in greetings (may differ from full name).
  const [preferredName, setPreferredName] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return (
      (user?.user_metadata?.['preferred_name'] as string | undefined) ??
      window.localStorage.getItem(LS_PREFERRED_NAME_KEY) ??
      initialFullName.split(' ')[0] ??
      ''
    );
  });

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Persona fields persisted in localStorage for v1; Cloud Managed will sync via user_metadata.
  const [workDescription, setWorkDescription] = useState<WorkDescription>(() => {
    if (typeof window === 'undefined') return '';
    return (window.localStorage.getItem(LS_WORK_KEY) as WorkDescription) ?? '';
  });

  const [instructions, setInstructions] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(LS_INSTRUCTIONS_KEY) ?? '';
  });

  // next-themes hook — same source as /settings/general theme toggle.
  const { theme: nextTheme, setTheme: setNextTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const selectedTheme =
    !mounted || !nextTheme ? 'dark' : (nextTheme as 'dark' | 'light' | 'system');

  async function handleSave() {
    const trimmedFull = displayName.trim();
    if (!trimmedFull) return;
    const trimmedPreferred = preferredName.trim() || (trimmedFull.split(' ')[0] ?? trimmedFull);
    setSaving(true);
    setSaveError(null);
    try {
      window.localStorage.setItem('agi.profile.displayName', trimmedFull);
      window.localStorage.setItem(LS_PREFERRED_NAME_KEY, trimmedPreferred);
      window.localStorage.setItem(LS_WORK_KEY, workDescription);
      window.localStorage.setItem(LS_INSTRUCTIONS_KEY, instructions);

      if (user) {
        const supabase = getSupabaseClient();
        const { error } = await supabase.auth.updateUser({
          data: {
            full_name: trimmedFull,
            preferred_name: trimmedPreferred,
            work_description: workDescription,
            instructions: instructions.slice(0, 2000),
          },
        });
        if (error) throw new Error(error.message);
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
          How the assistant refers to you and tailors its responses.
        </p>
      </div>

      {/* Identity section */}
      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Avatar row */}
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
              flexShrink: 0,
            }}
          >
            {(preferredName || displayName || user?.email || 'A').slice(0, 1)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>
              {user?.email ?? 'Not signed in'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                disabled
                title="Avatar upload requires Cloud Managed"
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-3)',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'not-allowed',
                  opacity: 0.6,
                }}
              >
                Change photo
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Cloud Managed only</span>
            </div>
          </div>
        </div>

        {/* Display name */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>Full name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 80))}
            maxLength={80}
            placeholder="Your name"
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

        {/* What should AGI call you -- independent from full name */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
            What should AGI call you?
          </span>
          <input
            type="text"
            value={preferredName}
            onChange={(e) => setPreferredName(e.target.value.slice(0, 60))}
            maxLength={60}
            placeholder="Nickname or first name"
            style={{
              fontSize: 14,
              padding: '8px 12px',
              background: 'var(--bg-base, #09090b)',
              color: 'var(--text-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            The assistant uses this in greetings and follow-ups.
          </span>
        </label>

        {/* Work description */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
            What best describes your work?
          </span>
          <select
            value={workDescription}
            onChange={(e) => setWorkDescription(e.target.value as WorkDescription)}
            style={{
              fontSize: 14,
              padding: '8px 12px',
              background: 'var(--bg-base, #09090b)',
              color: workDescription ? 'var(--text-1)' : 'var(--text-3)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              appearance: 'none',
              WebkitAppearance: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">Select a role...</option>
            {WORK_DESCRIPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            Helps AGI tailor explanations and suggestions.
          </span>
        </label>

        {/* Instructions */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
            Instructions for AGI
          </span>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value.slice(0, 2000))}
            maxLength={2000}
            rows={4}
            placeholder="e.g. I primarily work in Python (not a coding beginner). Prefer concise answers with code examples."
            style={{
              fontSize: 13,
              padding: '10px 12px',
              background: 'var(--bg-base, #09090b)',
              color: 'var(--text-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              resize: 'vertical',
              lineHeight: 1.5,
              fontFamily: 'inherit',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>
            {instructions.length} / 2000
          </span>
        </label>

        {/* Save row */}
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
            {saving ? 'Saving...' : 'Save'}
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

      {/* Appearance section */}
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              minHeight: 32,
            }}
          >
            <span style={{ fontSize: 14, color: 'var(--text-3)', flexShrink: 0 }}>Theme</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['dark', 'light', 'system'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNextTheme(t)}
                  style={{
                    padding: '5px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    background: selectedTheme === t ? 'var(--teal)' : 'transparent',
                    color: selectedTheme === t ? '#fff' : 'var(--text-2)',
                    fontSize: 13,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
