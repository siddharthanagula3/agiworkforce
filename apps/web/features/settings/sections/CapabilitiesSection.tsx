'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Switch } from '@agiworkforce/ui';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import { resetMemoryCapabilityCache } from '@/lib/runtime/memory-capability';

type CapabilitiesSettings = {
  memory: boolean;
  generateFromHistory: boolean;
};

const NAMESPACE = 'capabilities';

const DEFAULT_SETTINGS: CapabilitiesSettings = {
  memory: true,
  generateFromHistory: true,
};

export function CapabilitiesSection() {
  const [settings, setSettings] = useState<CapabilitiesSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPreferenceNamespace<CapabilitiesSettings>(NAMESPACE, DEFAULT_SETTINGS)
      .then((value) => {
        if (!cancelled) setSettings(value);
      })
      .catch(() => {
        // Local defaults remain usable when settings storage is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {saving
            ? 'Saving...'
            : saveError
              ? `Save failed: ${saveError}`
              : savedAt
                ? 'Saved'
                : 'Synced to your account'}
        </p>
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Memory
        </h3>

        {row(
          'Memory',
          'Allow AGI to remember details across conversations',
          <Switch
            checked={settings.memory}
            onCheckedChange={(value) => setBoolean('memory', value)}
          />,
        )}

        {row(
          'Generate from past chats',
          'Use conversation history to generate better responses',
          <Switch
            checked={settings.generateFromHistory}
            onCheckedChange={(value) => setBoolean('generateFromHistory', value)}
          />,
        )}

        <div className="flex flex-col items-start gap-3">
          <Link
            href="/settings/memory"
            className="text-xs text-[var(--chat-accent-primary)] hover:underline"
          >
            View and manage memory
          </Link>
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
        <Link href="/skills" className="text-[var(--chat-accent-primary)] hover:underline">
          Customize → Skills
        </Link>
        .
      </p>
    </div>
  );
}
