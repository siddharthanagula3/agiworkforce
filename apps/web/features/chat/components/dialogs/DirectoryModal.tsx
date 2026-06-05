'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shared/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@shared/ui/tabs';
import { Input } from '@shared/ui/input';
import { useDirectoryStore } from '@features/chat/stores/directory-store';
import { useSkillsList, type SkillItem } from '@features/chat/hooks/use-skills-list';
import { useConnectors } from '@features/connectors/hooks/use-connectors';
import { ConnectorCard } from '@features/connectors/components/ConnectorCard';
import { CONNECTORS } from '@features/connectors/data/connectors';
import { cn } from '@shared/lib/utils';

// ─── Source helpers ───────────────────────────────────────────────────────────

type SkillGroup = 'Built-in' | 'Personal' | 'Plugin' | 'Other';

function skillGroupLabel(source: string): SkillGroup {
  if (source === 'bundled' || source === 'managed-local') return 'Built-in';
  if (source === 'personal') return 'Personal';
  if (source === 'plugin' || source === 'mcp') return 'Plugin';
  return 'Other';
}

const GROUP_ORDER: SkillGroup[] = ['Built-in', 'Personal', 'Plugin', 'Other'];

function sourceBadgeClass(source: string): string {
  const group = skillGroupLabel(source);
  if (group === 'Built-in') return 'bg-blue-500/10 text-blue-400';
  if (group === 'Personal') return 'bg-amber-500/10 text-amber-400';
  if (group === 'Plugin') return 'bg-purple-500/10 text-purple-400';
  return 'bg-muted/60 text-muted-foreground';
}

// ─── SkillCard ────────────────────────────────────────────────────────────────

function SkillCard({ skill }: { skill: SkillItem }) {
  return (
    <div className="flex flex-col rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border">
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-foreground">/{skill.name}</span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
            sourceBadgeClass(skill.source),
          )}
        >
          {skillGroupLabel(skill.source)}
        </span>
      </div>
      <p className="mb-3 flex-1 text-xs leading-relaxed text-muted-foreground">
        {skill.description || 'No description.'}
      </p>
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
          Use
        </span>
      </div>
    </div>
  );
}

// ─── Skills Tab ───────────────────────────────────────────────────────────────

type SortKey = 'name' | 'source';

function SkillsTab({ query }: { query: string }) {
  const { skills, loading, error } = useSkillsList();
  const [filterSource, setFilterSource] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');

  const uniqueSources = useMemo(() => {
    const s = new Set(skills.map((sk) => skillGroupLabel(sk.source)));
    return GROUP_ORDER.filter((g) => s.has(g));
  }, [skills]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    let result = skills.filter(
      (s) =>
        (q === '' || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) &&
        (filterSource === 'all' || skillGroupLabel(s.source) === filterSource),
    );
    if (sortKey === 'name') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      result = [...result].sort((a, b) =>
        skillGroupLabel(a.source).localeCompare(skillGroupLabel(b.source)),
      );
    }
    return result;
  }, [skills, query, filterSource, sortKey]);

  // Group filtered skills by source label
  const grouped = useMemo(() => {
    const map = new Map<SkillGroup, SkillItem[]>();
    for (const sk of filtered) {
      const g = skillGroupLabel(sk.source);
      const arr = map.get(g) ?? [];
      arr.push(sk);
      map.set(g, arr);
    }
    return GROUP_ORDER.map((g) => ({ group: g, items: map.get(g) ?? [] })).filter(
      (e) => e.items.length > 0,
    );
  }, [filtered]);

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

  return (
    <div className="space-y-4">
      {/* Filter + Sort row */}
      <div className="flex items-center gap-2">
        {/* Filter by source */}
        <div className="relative">
          <label htmlFor="dir-filter-source" className="sr-only">
            Filter by source
          </label>
          <select
            id="dir-filter-source"
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="h-8 appearance-none rounded-md border border-border/60 bg-card pl-2.5 pr-7 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            <option value="all">All sources</option>
            {uniqueSources.map((src) => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
        </div>

        {/* Sort by */}
        <div className="relative">
          <label htmlFor="dir-sort-key" className="sr-only">
            Sort by
          </label>
          <select
            id="dir-sort-key"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-8 appearance-none rounded-md border border-border/60 bg-card pl-2.5 pr-7 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            <option value="name">Sort by name</option>
            <option value="source">Sort by source</option>
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {query || filterSource !== 'all'
              ? 'No skills match your filters.'
              : "No skills found. Create skills under ~/.claude/skills/ or your project's .claude/skills/."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ group, items }) => (
            <section key={group}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group}
                <span className="ml-1.5 font-normal">({items.length})</span>
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {items.map((skill) => (
                  <SkillCard key={skill.name} skill={skill} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Connectors Tab ───────────────────────────────────────────────────────────

function ConnectorsTab({ query, onUpgrade }: { query: string; onUpgrade: () => void }) {
  const { connectedIds, connectedAtMap, loading, mutatingIds, connect, disconnect } =
    useConnectors();

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return CONNECTORS.filter(
      (c) =>
        !c.exclusive &&
        (q === '' || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)),
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
          onUpgrade={onUpgrade}
        />
      ))}
    </div>
  );
}

// ─── DirectoryModal ───────────────────────────────────────────────────────────

export function DirectoryModal() {
  const router = useRouter();
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
              placeholder="Search skills and connectors..."
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
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
            <TabsContent value="skills" tabIndex={-1} className="mt-0">
              <SkillsTab query={query} />
            </TabsContent>
            <TabsContent value="connectors" tabIndex={-1} className="mt-0">
              <ConnectorsTab
                query={query}
                onUpgrade={() => {
                  setOpen(false);
                  router.push('/pricing');
                }}
              />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
