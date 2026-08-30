'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  fetchStoredPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import { toUserMessage } from '@/lib/user-error-message';

const NAMESPACE = 'security';

interface SecurityPrefs {
  deviceCodeSignInEnabled?: boolean;
}

/**
 * Turns off headless device-code sign-in for this account.
 *
 * Enforced on APPROVAL, in api/auth/device/approve, because starting the flow
 * is unauthenticated — there is no account to consult until a human approves a
 * code. No approval means no token, so refusing there refuses the whole grant.
 */
export function DeviceSignInToggle() {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStoredPreferenceNamespace<SecurityPrefs>(NAMESPACE)
      .then((stored) => {
        if (cancelled) return;
        setEnabled(stored.deviceCodeSignInEnabled !== false);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Default-on matches the server's own fallback, so the switch shows the
        // state the server will actually enforce rather than a guess.
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(async () => {
    if (saving) return;
    const next = !enabled;
    const previous = enabled;
    setEnabled(next);
    setSaving(true);
    setError(null);
    try {
      await savePreferenceNamespace<SecurityPrefs>(NAMESPACE, {
        deviceCodeSignInEnabled: next,
      });
    } catch (err) {
      // Leaving the switch flipped would claim a security setting the server
      // never took — the worst direction for this control to fail in.
      setEnabled(previous);
      setError(toUserMessage(err, 'Could not save that. Try again.'));
    } finally {
      setSaving(false);
    }
  }, [enabled, saving]);

  return (
    <section
      aria-label="Device sign-in"
      style={{
        border: '1px solid var(--settings-border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-elev)',
        padding: '16px 20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
            Approve sign-in from a device code
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-3)' }}>
            Lets the CLI, desktop and mobile apps sign in by showing you a short code to approve
            here. Turn this off if you never use them. Anyone who can get you to approve a code they
            generated gains access to your account, so only approve a code you started yourself.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Approve sign-in from a device code"
          disabled={!loaded || saving}
          onClick={() => void toggle()}
          style={{
            flexShrink: 0,
            width: 44,
            height: 24,
            borderRadius: 999,
            border: 'none',
            cursor: !loaded || saving ? 'default' : 'pointer',
            opacity: loaded ? 1 : 0.5,
            background: enabled ? 'var(--chat-accent-primary)' : 'var(--settings-border)',
            transition: 'background 0.15s',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'block',
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'var(--bg-elev)',
              transform: `translateX(${enabled ? 23 : 3}px)`,
              transition: 'transform 0.15s',
            }}
          />
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--settings-destructive-text)' }}
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
