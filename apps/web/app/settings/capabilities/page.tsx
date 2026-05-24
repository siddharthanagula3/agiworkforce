'use client';

import { useState, useEffect } from 'react';
import { Switch } from '@shared/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select';
import { Button } from '@shared/ui/button';
import Link from 'next/link';

const LS_PREFIX = 'agi.capabilities.';

function usePersisted(key: string, fallback: boolean) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    const stored = localStorage.getItem(LS_PREFIX + key);
    if (stored !== null) setValue(stored === 'true');
  }, [key]);
  const set = (v: boolean) => {
    setValue(v);
    localStorage.setItem(LS_PREFIX + key, String(v));
  };
  return [value, set] as const;
}

export default function CapabilitiesSettingsPage() {
  const [memory, setMemory] = usePersisted('memory', true);
  const [searchChats, setSearchChats] = usePersisted('searchChats', true);
  const [generateFromHistory, setGenerateFromHistory] = usePersisted('generateFromHistory', true);
  const [connectorDiscovery, setConnectorDiscovery] = usePersisted('connectorDiscovery', true);
  const [artifacts, setArtifacts] = usePersisted('artifacts', true);

  const [toolAccessMode, setToolAccessMode] = useState('needed');
  useEffect(() => {
    const stored = localStorage.getItem(LS_PREFIX + 'toolAccessMode');
    if (stored) setToolAccessMode(stored);
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Capabilities</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Control what AGI can do in your conversations.
        </p>
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Memory
        </h3>

        <div className="flex items-center justify-between rounded-lg border border-border/40 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Memory</p>
            <p className="text-xs text-muted-foreground">
              Allow AGI to remember details across conversations
            </p>
          </div>
          <Switch checked={memory} onCheckedChange={setMemory} />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/40 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Search and reference chats</p>
            <p className="text-xs text-muted-foreground">
              Let AGI search your past conversations for context
            </p>
          </div>
          <Switch checked={searchChats} onCheckedChange={setSearchChats} />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/40 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Generate from past chats</p>
            <p className="text-xs text-muted-foreground">
              Use conversation history to generate better responses
            </p>
          </div>
          <Switch checked={generateFromHistory} onCheckedChange={setGenerateFromHistory} />
        </div>

        <div className="flex gap-2">
          <Link
            href="/settings/memory"
            className="text-xs text-[var(--chat-accent-primary)] hover:underline"
          >
            View and manage memory
          </Link>
        </div>

        <Button variant="outline" size="sm" disabled className="text-xs">
          Import memory from other AI providers
        </Button>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          General
        </h3>

        <div className="flex items-center justify-between rounded-lg border border-border/40 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Tool access mode</p>
            <p className="text-xs text-muted-foreground">
              How AGI loads and uses tools from connectors
            </p>
          </div>
          <Select
            value={toolAccessMode}
            onValueChange={(v) => {
              setToolAccessMode(v);
              localStorage.setItem(LS_PREFIX + 'toolAccessMode', v);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="always">Always allow</SelectItem>
              <SelectItem value="needed">Load tools when needed</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/40 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Connector discovery</p>
            <p className="text-xs text-muted-foreground">
              Suggest relevant connectors during conversations
            </p>
          </div>
          <Switch checked={connectorDiscovery} onCheckedChange={setConnectorDiscovery} />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Visuals
        </h3>

        <div className="flex items-center justify-between rounded-lg border border-border/40 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Artifacts</p>
            <p className="text-xs text-muted-foreground">
              Allow AGI to generate interactive content: code previews, charts, and documents
              rendered inline
            </p>
          </div>
          <Switch checked={artifacts} onCheckedChange={setArtifacts} />
        </div>
      </section>
    </div>
  );
}
