'use client';

import React, { useState, useMemo } from 'react';
import { Loader2, Plug, Layers } from 'lucide-react';
import { useSkillsList } from '@features/chat/hooks/use-skills-list';
import { useConnectors } from '@features/connectors/hooks/use-connectors';
import { ConnectorCard } from '@features/connectors/components/ConnectorCard';
import { CONNECTORS } from '@features/connectors/data/connectors';
import { cn } from '@shared/lib/utils';

// ─── Skills Section ───────────────────────────────────────────────────────────

function SkillsSection() {
  const { skills, loading, error } = useSkillsList();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
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
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Skills</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Reusable prompt templates and instructions loaded into your AI sessions.
          </p>
        </div>
      </div>

      {skills.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
            <Layers className="h-5 w-5 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-medium text-foreground">No skills yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create skills under{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">~/.claude/skills/</code> or your
            project&apos;s{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">.claude/skills/</code>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <div
              key={skill.name}
              className="rounded-xl border border-border/60 bg-card p-5 transition-colors hover:border-border"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{skill.name}</h3>
                <span className="shrink-0 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {skill.source}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{skill.description}</p>
              {skill.location && (
                <p className="mt-2 truncate text-[10px] text-muted-foreground/50">
                  {skill.location}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Connectors Section ───────────────────────────────────────────────────────

function ConnectorsSection() {
  const { connectedIds, connectedAtMap, loading, mutatingIds, connect, disconnect } =
    useConnectors();

  const connectedList = useMemo(
    () => CONNECTORS.filter((c) => connectedIds.has(c.id)),
    [connectedIds],
  );

  const availableList = useMemo(
    () => CONNECTORS.filter((c) => !connectedIds.has(c.id)),
    [connectedIds],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">Connectors</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Connect external services so your AI agents can read and write on your behalf.
        </p>
      </div>

      {connectedList.length > 0 && (
        <section className="mb-8">
          <h3 className="mb-3 text-sm font-medium text-foreground">
            Connected
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({connectedList.length})
            </span>
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {connectedList.map((connector) => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                connected={true}
                mutating={mutatingIds.has(connector.id)}
                connectedAt={connectedAtMap[connector.id]}
                onConnect={() => void connect(connector.id, connector.authType)}
                onDisconnect={() => void disconnect(connector.id)}
              />
            ))}
          </div>
        </section>
      )}

      {connectedList.length === 0 && (
        <div className="mb-8 rounded-xl border border-border/60 bg-card p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
            <Plug className="h-5 w-5 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-medium text-foreground">No connectors connected yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect a service below to give your agents access.
          </p>
        </div>
      )}

      <section>
        <h3 className="mb-3 text-sm font-medium text-foreground">
          Available
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            ({availableList.length})
          </span>
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {availableList.map((connector) => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              connected={false}
              mutating={mutatingIds.has(connector.id)}
              onConnect={() => void connect(connector.id, connector.authType)}
              onDisconnect={() => void disconnect(connector.id)}
            />
          ))}
        </div>
      </section>
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

        <div className="flex gap-8">
          {/* Sub-sidebar nav */}
          <nav className="w-48 shrink-0" aria-label="Customize sections">
            <ul className="space-y-0.5">
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

          {/* Main content */}
          <div className="min-w-0 flex-1">
            {activeSection === 'skills' && <SkillsSection />}
            {activeSection === 'connectors' && <ConnectorsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
