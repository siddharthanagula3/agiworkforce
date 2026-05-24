'use client';

import { useState, useMemo } from 'react';
import { Search, Loader2, Puzzle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shared/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@shared/ui/tabs';
import { Input } from '@shared/ui/input';
import { useDirectoryStore } from '@features/chat/stores/directory-store';
import { useSkillsList } from '@features/chat/hooks/use-skills-list';
import { useConnectors } from '@features/connectors/hooks/use-connectors';
import { ConnectorCard } from '@features/connectors/components/ConnectorCard';
import { CONNECTORS } from '@features/connectors/data/connectors';

// ─── Skills Tab ───────────────────────────────────────────────────────────────

function SkillsTab({ query }: { query: string }) {
  const { skills, loading, error } = useSkillsList();

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return skills.filter(
      (s) =>
        q === '' || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    );
  }, [skills, query]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
        Failed to load skills: {error}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {query
            ? 'No skills match your search.'
            : "No skills found. Create skills under ~/.claude/skills/ or your project's .claude/skills/."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {filtered.map((skill) => (
        <div
          key={skill.name}
          className="rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border"
        >
          <div className="mb-1 text-sm font-semibold text-foreground">{skill.name}</div>
          <div className="mb-2 text-xs leading-relaxed text-muted-foreground">
            {skill.description}
          </div>
          <div className="text-[10px] text-muted-foreground/60">Source: {skill.source}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Connectors Tab ───────────────────────────────────────────────────────────

function ConnectorsTab({ query }: { query: string }) {
  const { connectedIds, connectedAtMap, loading, mutatingIds, connect, disconnect } =
    useConnectors();

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return CONNECTORS.filter(
      (c) =>
        q === '' || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    );
  }, [query]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">No connectors match your search.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {filtered.map((connector) => (
        <ConnectorCard
          key={connector.id}
          connector={connector}
          connected={connectedIds.has(connector.id)}
          mutating={mutatingIds.has(connector.id)}
          connectedAt={connectedAtMap[connector.id]}
          onConnect={() => void connect(connector.id, connector.authType)}
          onDisconnect={() => void disconnect(connector.id)}
        />
      ))}
    </div>
  );
}

// ─── Plugins Tab ─────────────────────────────────────────────────────────────

function PluginsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
        <Puzzle className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
      </div>
      <h3 className="text-base font-medium text-foreground">Plugins coming soon</h3>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        The plugin system is under development. Check back in a future release.
      </p>
    </div>
  );
}

// ─── DirectoryModal ───────────────────────────────────────────────────────────

export function DirectoryModal() {
  const { open, setOpen } = useDirectoryStore();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('skills');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle className="text-base font-semibold">Directory</DialogTitle>

          {/* Search */}
          <div className="relative mt-3">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder="Search skills, connectors, and plugins..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-9 text-sm"
              aria-label="Search directory"
            />
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v);
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="mx-6 mt-4 h-9 w-auto justify-start rounded-lg bg-muted/50 p-1 shrink-0">
            <TabsTrigger value="skills" className="rounded-md px-4 text-sm">
              Skills
            </TabsTrigger>
            <TabsTrigger value="connectors" className="rounded-md px-4 text-sm">
              Connectors
            </TabsTrigger>
            <TabsTrigger value="plugins" className="rounded-md px-4 text-sm">
              Plugins
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
            <TabsContent value="skills" tabIndex={-1} className="mt-0">
              <SkillsTab query={query} />
            </TabsContent>
            <TabsContent value="connectors" tabIndex={-1} className="mt-0">
              <ConnectorsTab query={query} />
            </TabsContent>
            <TabsContent value="plugins" tabIndex={-1} className="mt-0">
              <PluginsTab />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
