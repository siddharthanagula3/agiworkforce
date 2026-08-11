'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Switch } from '@agiworkforce/ui';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import { resetMemoryCapabilityCache } from '@/lib/runtime/memory-capability';
import { SettingsSectionLink } from '../components/SettingsSectionLink';

type CapabilitiesSettings = {
  memory: boolean;
  generateFromHistory: boolean;
  allowToolAssistedGeneration: boolean;
};

const NAMESPACE = 'capabilities';

const DEFAULT_SETTINGS: CapabilitiesSettings = {
  // Privacy-safe default: memory does not read or generate until the user opts in.
  memory: false,
  generateFromHistory: true,
  allowToolAssistedGeneration: false,
};

export function CapabilitiesSection() {
  const [settings, setSettings] = useState<CapabilitiesSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // AUDIT-FIX PAR-32: a swallowed load failure left the toggles showing
  // DEFAULT_SETTINGS (both on) under a 'Synced to your account' label, so a
  // user whose stored preference was memory:false saw it rendered on — and
  // toggling anything then persisted that wrong baseline. Track the failure.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchPreferenceNamespace<CapabilitiesSettings>(NAMESPACE, DEFAULT_SETTINGS)
      .then((value) => {
        if (cancelled) return;
        setSettings(value);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load settings');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const persist = useCallback(async (next: CapabilitiesSettings) => {
    setSettings(next);
    setSaving(true);
    setSaveError(null);
    try {
      await savePreferenceNamespace(NAMESPACE, next);
      // Let the chat runtime pick up the new Memory toggle without a reload.
      resetMemoryCapabilityCache();
      setSavedAt(Date.now());
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, []);

  const setBoolean = (key: keyof CapabilitiesSettings, value: boolean) => {
    void persist({ ...settings, [key]: value });
  };

  const row = (title: string, description: string, control: ReactNode) => (
    <div className="flex items-center justify-between rounded-lg border border-border/40 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {control}
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Capabilities</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Control what AGI can do in your conversations.
        </p>
        {/* AUDIT-FIX PAR-32: report a failed load instead of falling through
          to 'Synced to your account' while the toggles show local defaults. */}
        <p
          className={`mt-2 text-xs ${loadError ? 'text-destructive' : 'text-muted-foreground'}`}
          role="status"
        >
          {saving
            ? 'Saving...'
            : saveError
              ? `Save failed: ${saveError}`
              : loadError
                ? `Your saved settings could not be loaded: ${loadError}`
                : savedAt
                  ? 'Saved'
                  : 'Synced to your account'}
        </p>
        {loadError && (
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="mt-2 rounded-md border border-border/60 px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted/60"
          >
            Try again
          </button>
        )}
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Memory
        </h3>

        {row(
          'Memory',
          'Allow AGI to remember details across conversations',
          // AUDIT-FIX PAR-32: while the stored value is unknown the control
          // must not be presented as an editable reflection of it.
          <Switch
            aria-label="Memory"
            checked={settings.memory}
            disabled={loadError !== null}
            onCheckedChange={(value) => setBoolean('memory', value)}
          />,
        )}

        {row(
          'Generate from past chats',
          'Use conversation history to generate better responses',
          <Switch
            aria-label="Generate from past chats"
            checked={settings.generateFromHistory}
            disabled={loadError !== null || !settings.memory}
            onCheckedChange={(value) => setBoolean('generateFromHistory', value)}
          />,
        )}

        {row(
          'Allow memory generation from tool-assisted chats',
          'Create memories from chats that use tools, connectors, code, or web search',
          <Switch
            aria-label="Allow memory generation from tool-assisted chats"
            checked={settings.allowToolAssistedGeneration}
            disabled={loadError !== null || !settings.memory}
            onCheckedChange={(value) => setBoolean('allowToolAssistedGeneration', value)}
          />,
        )}

        <div className="flex flex-col items-start gap-3">
          <SettingsSectionLink
            section="memory"
            className="text-xs text-[var(--chat-accent-primary)] hover:underline"
          >
            View and manage memory
          </SettingsSectionLink>
          {/*
            The "Import memory from other AI providers" row was removed: the web
            import flow is a placeholder (no working provider import endpoint), so
            surfacing a Start-import control would be a dead/fake control. It will
            return here once the import backend ships.
          */}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Skills have moved to{' '}
        <SettingsSectionLink
          section="skills"
          className="text-[var(--chat-accent-primary)] hover:underline"
        >
          Customize → Skills
        </SettingsSectionLink>
        .
      </p>
    </div>
  );
}
