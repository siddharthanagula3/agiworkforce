'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Switch } from '@shared/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select';
import { Button } from '@shared/ui/button';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';

type ToolAccessMode = 'always' | 'needed' | 'custom';

type CapabilitiesSettings = {
  memory: boolean;
  searchChats: boolean;
  generateFromHistory: boolean;
  toolAccessMode: ToolAccessMode;
  connectorDiscovery: boolean;
  artifacts: boolean;
};

const NAMESPACE = 'capabilities';

const DEFAULT_SETTINGS: CapabilitiesSettings = {
  memory: true,
  searchChats: true,
  generateFromHistory: true,
  toolAccessMode: 'needed',
  connectorDiscovery: true,
  artifacts: true,
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
      setSavedAt(Date.now());
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, []);

  const setBoolean = (key: keyof Omit<CapabilitiesSettings, 'toolAccessMode'>, value: boolean) => {
    void persist({ ...settings, [key]: value });
  };

  const setToolAccessMode = (value: ToolAccessMode) => {
    void persist({ ...settings, toolAccessMode: value });
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
          'Search and reference chats',
          'Let AGI search your past conversations for context',
          <Switch
            checked={settings.searchChats}
            onCheckedChange={(value) => setBoolean('searchChats', value)}
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

          <Button variant="outline" size="sm" asChild className="text-xs">
            <Link href="/settings/memory#import">Import memory from other AI providers</Link>
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          General
        </h3>

        {row(
          'Tool access mode',
          'How AGI loads and uses tools from connectors',
          <Select value={settings.toolAccessMode} onValueChange={setToolAccessMode}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="always">Always allow</SelectItem>
              <SelectItem value="needed">Load tools when needed</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>,
        )}

        {row(
          'Connector discovery',
          'Suggest relevant connectors during conversations',
          <Switch
            checked={settings.connectorDiscovery}
            onCheckedChange={(value) => setBoolean('connectorDiscovery', value)}
          />,
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Visuals
        </h3>

        {row(
          'Artifacts',
          'Allow AGI to generate interactive content: code previews, charts, and documents rendered inline',
          <Switch
            checked={settings.artifacts}
            onCheckedChange={(value) => setBoolean('artifacts', value)}
          />,
        )}
      </section>
    </div>
  );
}
