'use client';

import { useEffect, useState } from 'react';
import { Switch } from '@agiworkforce/ui';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import { toUserMessage } from '@/lib/user-error-message';

const NAMESPACE = 'safety';

interface SafetyPreferences {
  reduceSensitiveContent: boolean;
}

const DEFAULT_SAFETY_PREFERENCES: SafetyPreferences = {
  reduceSensitiveContent: false,
};

export function SafetySection() {
  const [preferences, setPreferences] = useState<SafetyPreferences>(DEFAULT_SAFETY_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPreferenceNamespace<SafetyPreferences>(NAMESPACE, DEFAULT_SAFETY_PREFERENCES)
      .then((value) => {
        if (!cancelled) {
          setPreferences(value);
          setError(null);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(toUserMessage(caught, 'Failed to load safety settings'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (enabled: boolean) => {
    const next = { reduceSensitiveContent: enabled };
    setPreferences(next);
    setSaving(true);
    setError(null);
    void savePreferenceNamespace(NAMESPACE, next)
      .catch((caught) => {
        setPreferences((current) => ({
          ...current,
          reduceSensitiveContent: !enabled,
        }));
        setError(toUserMessage(caught, 'Failed to save safety settings'));
      })
      .finally(() => setSaving(false));
  };

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
          Safety
        </h1>
        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 14 }}>
          Choose additional safeguards for Managed Cloud prompts.
        </p>
        <p
          role={error ? 'alert' : 'status'}
          style={{
            margin: '8px 0 0',
            color: error ? 'var(--chat-accent-primary-text, #8b5f1d)' : 'var(--text-3)',
            fontSize: 12,
          }}
        >
          {loading
            ? 'Loading account settings...'
            : saving
              ? 'Saving...'
              : error
                ? `Save failed: ${error}`
                : 'Synced to your account'}
        </p>
      </div>

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
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
              Reduce sensitive content
            </div>
            <p
              style={{
                maxWidth: 520,
                margin: '5px 0 0',
                color: 'var(--text-3)',
                fontSize: 12,
                lineHeight: 1.55,
              }}
            >
              Block clearly explicit or harmful how-to prompts before they reach a Managed Cloud
              model. Educational, medical, journalistic, and support-seeking discussion remains
              available.
            </p>
          </div>
          <Switch
            checked={preferences.reduceSensitiveContent}
            disabled={loading || saving}
            onCheckedChange={handleChange}
            aria-label="Reduce sensitive content"
          />
        </div>
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--settings-border)',
            color: 'var(--text-3)',
            fontSize: 12,
            lineHeight: 1.55,
          }}
        >
          This setting changes prompt admission. It does not monitor conversations, notify another
          person, or replace emergency services.
        </div>
      </section>
    </div>
  );
}
