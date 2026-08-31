'use client';

import { useCallback, useEffect, useState } from 'react';
import { Switch } from '@agiworkforce/ui';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import {
  DEFAULT_LOCKDOWN_PREFERENCES,
  LOCKDOWN_PREFERENCE_NAMESPACE,
  type LockdownPreferences,
} from '@shared/types/lockdownMode';
import { toUserMessage } from '@/lib/user-error-message';

export function LockdownModePanel() {
  const [enabled, setEnabled] = useState(DEFAULT_LOCKDOWN_PREFERENCES.enabled);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPreferenceNamespace<LockdownPreferences>(
      LOCKDOWN_PREFERENCE_NAMESPACE,
      DEFAULT_LOCKDOWN_PREFERENCES,
    )
      .then((value) => {
        if (cancelled) return;
        setEnabled(value.enabled);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(toUserMessage(error, 'Failed to load lockdown mode'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    async (next: boolean) => {
      const previous = enabled;
      setEnabled(next);
      setSaving(true);
      setSaveError(null);
      try {
        await savePreferenceNamespace<LockdownPreferences>(LOCKDOWN_PREFERENCE_NAMESPACE, {
          enabled: next,
        });
        setSavedAt(Date.now());
      } catch (error) {
        setEnabled(previous);
        setSaveError(toUserMessage(error, 'Failed to save lockdown mode'));
      } finally {
        setSaving(false);
      }
    },
    [enabled],
  );

  return (
    <section className="space-y-3" aria-labelledby="lockdown-heading">
      <h3
        id="lockdown-heading"
        className="text-sm font-medium uppercase tracking-wider text-muted-foreground"
      >
        Lockdown mode
      </h3>

      <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Refuse every connector tool</p>
          <p className="mt-1 text-xs text-muted-foreground">
            AGI stops offering connector tools to the model entirely, so a web page, document, or
            connector response cannot talk it into calling one. Your connectors stay connected and
            your per-tool choices are kept; nothing is offered while this is on.
          </p>
          {enabled ? (
            <p className="mt-2 text-xs font-medium text-[var(--chat-accent-primary-text)]">
              Connector tools are unavailable in every chat on this account.
            </p>
          ) : null}
        </div>
        <Switch
          aria-label="Lockdown mode"
          checked={enabled}
          disabled={saving || loadError !== null}
          onCheckedChange={(value) => void persist(value)}
        />
      </div>

      {loadError ? (
        <p role="alert" className="text-xs text-destructive">
          {loadError}
        </p>
      ) : null}
      {saveError ? (
        <p role="alert" className="text-xs text-destructive">
          {saveError}
        </p>
      ) : null}
      {savedAt !== null && !saveError ? (
        <p role="status" className="text-xs text-muted-foreground">
          Saved.
        </p>
      ) : null}
    </section>
  );
}
