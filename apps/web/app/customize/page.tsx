'use client';

import React, { useState, useMemo } from 'react';
import { Loader2, Plug, Layers, ChevronRight } from 'lucide-react';
import { useSkillsList, type SkillItem } from '@features/chat/hooks/use-skills-list';
import { useConnectors } from '@features/connectors/hooks/use-connectors';
import { CONNECTORS } from '@features/connectors/data/connectors';
import type { Connector } from '@features/connectors/data/connectors';
import { cn } from '@shared/lib/utils';

// ─── Source helpers (mirrors DirectoryModal) ──────────────────────────────────

function skillSourceLabel(source: string): string {
  if (source === 'bundled' || source === 'managed-local') return 'Built-in';
  if (source === 'personal') return 'Personal';
  if (source === 'plugin' || source === 'mcp') return 'Plugin';
  if (source === 'project' || source === 'workspace') return 'Project';
  return source;
}

function sourceBadgeClass(source: string): string {
  const label = skillSourceLabel(source);
  if (label === 'Built-in') return 'bg-blue-500/10 text-blue-400';
  if (label === 'Personal') return 'bg-amber-500/10 text-amber-400';
  if (label === 'Plugin') return 'bg-purple-500/10 text-purple-400';
  return 'bg-muted/60 text-muted-foreground';
}

// ─── Skills pane ──────────────────────────────────────────────────────────────

function SkillDetailPane({ skill }: { skill: SkillItem }) {
  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <h2 className="font-mono text-base font-semibold text-foreground">/{skill.name}</h2>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
            sourceBadgeClass(skill.source),
          )}
        >
          {skillSourceLabel(skill.source)}
        </span>
      </div>

      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
        {skill.description || 'No description provided.'}
      </p>

      <div className="space-y-3">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Trigger
          </p>
          <p className="font-mono text-xs text-foreground/80">/{skill.name}</p>
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Added by
          </p>
          <p className="font-mono text-xs text-foreground/80">{skillSourceLabel(skill.source)}</p>
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Allowed tools
          </p>
          <p className="font-mono text-xs text-foreground/80">Not specified</p>
        </div>

        {skill.location && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Location
            </p>
            <p className="break-all font-mono text-xs text-foreground/80">{skill.location}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SkillEmptyDetail() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/40">
        <Layers className="h-5 w-5 text-muted-foreground/50" aria-hidden="true" />
      </div>
      <p className="text-sm text-muted-foreground">Select a skill to see details</p>
    </div>
  );
}

type SkillGroup = 'Built-in' | 'Personal' | 'Plugin' | 'Project' | 'Other';
const SKILL_GROUP_ORDER: SkillGroup[] = ['Built-in', 'Personal', 'Plugin', 'Project', 'Other'];

function skillGroup(source: string): SkillGroup {
  const label = skillSourceLabel(source);
  if (label === 'Built-in') return 'Built-in';
  if (label === 'Personal') return 'Personal';
  if (label === 'Plugin') return 'Plugin';
  if (label === 'Project') return 'Project';
  return 'Other';
}

function SkillsList({
  selectedName,
  onSelect,
}: {
  selectedName: string | null;
  onSelect: (name: string) => void;
}) {
  const { skills, loading, error } = useSkillsList();

  const grouped = useMemo(() => {
    const map = new Map<SkillGroup, SkillItem[]>();
    for (const sk of skills) {
      const g = skillGroup(sk.source);
      const arr = map.get(g) ?? [];
      arr.push(sk);
      map.set(g, arr);
    }
    return SKILL_GROUP_ORDER.map((g) => ({ group: g, items: map.get(g) ?? [] })).filter(
      (e) => e.items.length > 0,
    );
  }, [skills]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <p className="p-4 text-xs text-destructive">Failed to load skills: {error}</p>;
  }

  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted/50">
          <Layers className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
        </div>
        <p className="text-xs text-muted-foreground">
          No skills yet. Create skills under{' '}
          <code className="rounded bg-muted px-1 py-0.5">~/.claude/skills/</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {grouped.map(({ group, items }) => (
        <div key={group}>
          <p className="sticky top-0 bg-card px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            {group}
          </p>
          {items.map((skill) => (
            <button
              key={skill.name}
              onClick={() => onSelect(skill.name)}
              className={cn(
                'flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors',
                selectedName === skill.name
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-muted/40',
              )}
              aria-current={selectedName === skill.name ? 'true' : undefined}
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-medium">/{skill.name}</p>
                <p className="truncate text-xs text-muted-foreground">{skill.description}</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Connectors pane ──────────────────────────────────────────────────────────

function ConnectorDetailPane({
  connector,
  connected,
  connectedAt,
  mutating,
  onConnect,
  onDisconnect,
}: {
  connector: Connector;
  connected: boolean;
  connectedAt?: string;
  mutating: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto p-5">
      <h2 className="mb-1 text-base font-semibold text-foreground">{connector.name}</h2>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{connector.description}</p>

      <div className="space-y-3">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Status
          </p>
          <p className="text-xs text-foreground/80">{connected ? 'Connected' : 'Not connected'}</p>
        </div>
        {connected && connectedAt && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Connected at
            </p>
            <p className="font-mono text-xs text-foreground/80">{connectedAt}</p>
          </div>
        )}
      </div>

      <div className="mt-5">
        {connected ? (
          <button
            onClick={onDisconnect}
            disabled={mutating}
            className="rounded-lg border border-destructive/40 px-4 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            {mutating ? 'Disconnecting...' : 'Disconnect'}
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={mutating}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {mutating ? 'Connecting...' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
}

function ConnectorEmptyDetail() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/40">
        <Plug className="h-5 w-5 text-muted-foreground/50" aria-hidden="true" />
      </div>
      <p className="text-sm text-muted-foreground">Select a connector to see details</p>
    </div>
  );
}

function ConnectorsList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { connectedIds, loading } = useConnectors();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {CONNECTORS.map((connector) => {
        const connected = connectedIds.has(connector.id);
        return (
          <button
            key={connector.id}
            onClick={() => onSelect(connector.id)}
            className={cn(
              'flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors',
              selectedId === connector.id
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-muted/40',
            )}
            aria-current={selectedId === connector.id ? 'true' : undefined}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{connector.name}</p>
              <p className="truncate text-xs text-muted-foreground">{connector.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {connected && (
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" aria-label="connected" />
              )}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Customize Page ───────────────────────────────────────────────────────────

type Section = 'skills' | 'connectors';

const NAV_ITEMS: { id: Section; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'skills', label: 'Skills', icon: Layers },
  { id: 'connectors', label: 'Connectors', icon: Plug },
];

export default function CustomizePage() {
  const [activeSection, setActiveSection] = useState<Section>('skills');
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null);

  const { skills } = useSkillsList();
  const { connectedIds, connectedAtMap, mutatingIds, connect, disconnect } = useConnectors();

  const selectedSkillItem = useMemo(
    () => (selectedSkill ? (skills.find((s) => s.name === selectedSkill) ?? null) : null),
    [selectedSkill, skills],
  );

  const selectedConnectorItem = useMemo(
    () => (selectedConnector ? (CONNECTORS.find((c) => c.id === selectedConnector) ?? null) : null),
    [selectedConnector],
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Customize</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your skills, connectors, and personal preferences.
          </p>
        </div>

        {/* 3-pane layout */}
        <div className="flex h-[calc(100vh-13rem)] overflow-hidden rounded-xl border border-border/60 bg-card">
          {/* Pane 1: left nav */}
          <nav
            className="w-44 shrink-0 border-r border-border/60 py-2"
            aria-label="Customize sections"
          >
            <ul className="space-y-0.5 px-2">
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                <li key={id}>
                  <button
                    onClick={() => setActiveSection(id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      activeSection === id
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                    aria-current={activeSection === id ? 'page' : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Pane 2: item list */}
          <div className="w-64 shrink-0 overflow-hidden border-r border-border/60">
            <div className="border-b border-border/60 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                {activeSection === 'skills' ? 'Skills' : 'Connectors'}
              </p>
            </div>
            {activeSection === 'skills' ? (
              <SkillsList
                selectedName={selectedSkill}
                onSelect={(name) => {
                  setSelectedSkill(name);
                }}
              />
            ) : (
              <ConnectorsList
                selectedId={selectedConnector}
                onSelect={(id) => {
                  setSelectedConnector(id);
                }}
              />
            )}
          </div>

          {/* Pane 3: detail */}
          <div className="min-w-0 flex-1 overflow-hidden">
            {activeSection === 'skills' ? (
              selectedSkillItem ? (
                <SkillDetailPane skill={selectedSkillItem} />
              ) : (
                <SkillEmptyDetail />
              )
            ) : selectedConnectorItem ? (
              <ConnectorDetailPane
                connector={selectedConnectorItem}
                connected={connectedIds.has(selectedConnectorItem.id)}
                connectedAt={connectedAtMap[selectedConnectorItem.id]}
                mutating={mutatingIds.has(selectedConnectorItem.id)}
                onConnect={() =>
                  void connect(selectedConnectorItem.id, selectedConnectorItem.authType)
                }
                onDisconnect={() => void disconnect(selectedConnectorItem.id)}
              />
            ) : (
              <ConnectorEmptyDetail />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
