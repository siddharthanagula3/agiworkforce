'use client';

import { useEffect, useState } from 'react';
import { Switch } from '@agiworkforce/ui';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import { toUserMessage } from '@/lib/user-error-message';
import { helpArticlePath } from '@/lib/support/help-paths';

const NAMESPACE = 'safety';
const SAFETY_HELP_ARTICLE = 'crisis-resources';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h1
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 24,
          fontWeight: 500,
          color: 'var(--text-1)',
          margin: 0,
        }}
      >
        Safety
      </h1>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          padding: 'var(--space-4) 0',
          borderBottom: '1px solid var(--settings-border)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--text-1)', fontSize: 14 }}>Reduce sensitive content</div>
          <p
            id="safety-reduce-sensitive-description"
            style={{
              maxWidth: 520,
              margin: 'var(--space-1) 0 0',
              color: 'var(--text-3)',
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            Refuse explicit or harmful how-to prompts before they reach a Managed Cloud model,
            without monitoring your chats, alerting anyone or replacing emergency services.{' '}
            <a
              href={helpArticlePath(SAFETY_HELP_ARTICLE)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}
            >
              Learn more
            </a>
          </p>
        </div>
        <Switch
          checked={preferences.reduceSensitiveContent}
          disabled={loading || saving}
          onCheckedChange={handleChange}
          aria-label="Reduce sensitive content"
          aria-describedby="safety-reduce-sensitive-description"
        />
      </div>

      {error ? (
        <p
          role="alert"
          style={{ margin: 0, color: 'var(--settings-destructive-text)', fontSize: 14 }}
        >
          {error}
        </p>
      ) : saving ? (
        <p role="status" style={{ margin: 0, color: 'var(--text-3)', fontSize: 14 }}>
          Saving…
        </p>
      ) : null}
    </div>
  );
}
