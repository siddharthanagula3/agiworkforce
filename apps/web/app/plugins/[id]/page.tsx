'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Layers, Link2, CheckCircle2, Circle, Puzzle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
import { cn } from '@shared/lib/utils';
import { EXAMPLE_PLUGINS } from '@/features/plugins/data/plugins';
import type { Plugin } from '@/features/plugins/types';
import { useConnectors } from '@/features/connectors/hooks/use-connectors';

function sourceBadgeClass(source: string): string {
  if (source === 'builtin') return 'bg-primary/15 text-primary border-primary/20';
  if (source === 'marketplace') return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
  return 'bg-muted/60 text-muted-foreground border-border/40';
}

function sourceLabel(source: string): string {
  if (source === 'builtin') return 'Built-in';
  if (source === 'marketplace') return 'Marketplace';
  return 'Custom';
}

// ── Inner component — only rendered once plugin is confirmed non-null ──────────

function PluginDetail({ plugin }: { plugin: Plugin }) {
  const { connectedIds, loading: connectorsLoading } = useConnectors();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Back link */}
      <Link
        href="/plugins"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Plugin Marketplace
      </Link>

      {/* Plugin header */}
      <div className="mb-8 flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15">
          <Puzzle className="h-7 w-7 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-bold leading-tight text-foreground">
              {plugin.name}
            </h1>
            <Badge
              className={cn('border text-[10px] font-medium', sourceBadgeClass(plugin.source))}
            >
              {sourceLabel(plugin.source)}
            </Badge>
          </div>
          <p className="mb-1 text-sm text-muted-foreground">
            by {plugin.author} &nbsp;&middot;&nbsp; v{plugin.version} &nbsp;&middot;&nbsp;{' '}
            {plugin.category}
          </p>
        </div>
        <Button
          disabled
          variant="outline"
          className="shrink-0"
          aria-label={`${plugin.name} is preview only`}
        >
          Preview only
        </Button>
      </div>

      {/* Description */}
      <p className="mb-8 text-sm leading-relaxed text-foreground">{plugin.description}</p>

      {/* Skills included */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle as="h2" className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4 text-primary" />
            Included Skills
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {plugin.skills.length === 0 ? (
            <p className="text-xs text-muted-foreground">No skills bundled with this plugin.</p>
          ) : (
            <ul className="space-y-2">
              {plugin.skills.map((skill) => (
                <li
                  key={skill}
                  className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm text-foreground"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
                    {skill.substring(0, 2).toUpperCase()}
                  </span>
                  {skill}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Required connectors with connection status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle as="h2" className="flex items-center gap-2 text-sm font-semibold">
            <Link2 className="h-4 w-4 text-primary" />
            Required Connectors
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {plugin.connectors.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              This plugin does not require any connectors.
            </p>
          ) : (
            <ul className="space-y-2">
              {plugin.connectors.map((connectorId) => {
                const connected = !connectorsLoading && connectedIds.has(connectorId);
                return (
                  <li
                    key={connectorId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      {connected ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                      )}
                      <span className="text-sm capitalize text-foreground">{connectorId}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {connectorsLoading ? (
                        <span className="text-[11px] text-muted-foreground">Checking...</span>
                      ) : connected ? (
                        <Badge className="border border-emerald-500/20 bg-emerald-500/15 text-[10px] font-medium text-emerald-400">
                          Connected
                        </Badge>
                      ) : (
                        <Link
                          href="/connectors"
                          className="text-[11px] text-primary underline-offset-2 hover:underline"
                        >
                          Connect
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Page entry point — resolves params, guards 404 before rendering detail ─────

interface Props {
  params: Promise<{ id: string }>;
}

export default function PluginDetailPage({ params }: Props) {
  const { id } = use(params);
  const plugin = EXAMPLE_PLUGINS.find((p) => p.id === id);

  if (!plugin) {
    notFound();
  }

  return <PluginDetail plugin={plugin} />;
}
