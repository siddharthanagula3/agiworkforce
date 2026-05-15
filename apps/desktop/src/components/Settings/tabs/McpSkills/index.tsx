import { Suspense, lazy } from 'react';
import { Database, Loader2, Plug, Wrench, Zap } from 'lucide-react';
import { Button } from '../../../ui/Button';
import { cn } from '@/lib/utils';

const LazyMCPToolsSettings = lazy(() =>
  import('../../MCPToolsSettings').then((m) => ({ default: m.MCPToolsSettings })),
);
const LazySkillsPluginsSettings = lazy(() =>
  import('../../SkillsPluginsSettings').then((m) => ({ default: m.SkillsPluginsSettings })),
);
const LazyMCPServerSettings = lazy(() =>
  import('../../MCPServerSettings').then((m) => ({ default: m.MCPServerSettings })),
);
const LazyToolsPanel = lazy(() =>
  import('../../../Tools/ToolsPanel').then((m) => ({ default: m.ToolsPanel })),
);
const LazyResearchSettings = lazy(() =>
  import('../../ResearchSettings').then((m) => ({ default: m.ResearchSettings })),
);

function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

interface McpSkillsTabProps {
  isBusy: boolean;
  onOpenConnectors: () => void;
}

export function McpSkillsTab({ isBusy, onOpenConnectors }: McpSkillsTabProps) {
  const cards = [
    {
      title: 'Skills & Plugins',
      description: 'Install reusable capabilities and project-specific helpers.',
      icon: Zap,
      action: undefined as (() => void) | undefined,
    },
    {
      title: 'MCP Tools',
      description: 'Control which tools and servers are available to agents.',
      icon: Wrench,
      action: undefined as (() => void) | undefined,
    },
    {
      title: 'Research Defaults',
      description: 'Tune search, sources, and retrieval behavior.',
      icon: Database,
      action: undefined as (() => void) | undefined,
    },
    {
      title: 'Integrations',
      description: 'Connect the apps and services your workforce can reach.',
      icon: Plug,
      action: onOpenConnectors,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Customize your workforce</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage the skills, tools, research defaults, and integrations your agents can use.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenConnectors} disabled={isBusy}>
            <Plug className="mr-2 h-4 w-4" />
            Open integrations
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={item.action}
              disabled={!item.action || isBusy}
              className={cn(
                'rounded-lg border border-border bg-background p-3 text-left transition-colors',
                item.action ? 'hover:border-primary/40 hover:bg-muted/40' : 'cursor-default',
                !item.action && 'opacity-90',
              )}
            >
              <item.icon className="h-4 w-4 text-primary" />
              <div className="mt-3 text-sm font-medium">{item.title}</div>
              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
            </button>
          ))}
        </div>
      </div>

      <Suspense fallback={<Fallback label="Loading customization settings..." />}>
        <>
          <LazyMCPToolsSettings />
          <div className="pt-6 border-t border-border">
            <LazySkillsPluginsSettings />
          </div>
          <div className="pt-6 border-t border-border">
            <h3 className="text-lg font-semibold mb-4">MCP Server</h3>
            <LazyMCPServerSettings />
          </div>
          <div className="pt-6 border-t border-border">
            <h3 className="text-lg font-semibold mb-4">Tools</h3>
            <div className="h-full flex flex-col min-h-0">
              <LazyToolsPanel />
            </div>
          </div>
          <div className="pt-6 border-t border-border">
            <h3 className="text-lg font-semibold mb-4">Research</h3>
            <LazyResearchSettings />
          </div>
        </>
      </Suspense>
    </div>
  );
}
