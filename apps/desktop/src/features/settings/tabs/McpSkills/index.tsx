import { Suspense, lazy, useCallback, useRef, type RefObject } from 'react';
import { Database, Loader2, Plug, Wrench, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
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
  import('@/features/tools/ToolsPanel').then((m) => ({ default: m.ToolsPanel })),
);
const LazyResearchSettings = lazy(() =>
  import('../../ResearchSettings').then((m) => ({ default: m.ResearchSettings })),
);
const LazySkillMarketplace = lazy(() =>
  import('@/features/skill-marketplace/SkillMarketplace').then((m) => ({
    default: m.SkillMarketplace,
  })),
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
  const skillCatalogRef = useRef<HTMLDivElement>(null);
  const mcpToolsRef = useRef<HTMLDivElement>(null);
  const skillsPluginsRef = useRef<HTMLDivElement>(null);
  const researchRef = useRef<HTMLDivElement>(null);

  const scrollToSection = useCallback((ref: RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const cards = [
    {
      title: 'Skills & Plugins',
      description: 'Install reusable capabilities and project-specific helpers.',
      icon: Zap,
      action: () => scrollToSection(skillsPluginsRef),
    },
    {
      title: 'MCP Tools',
      description: 'Control which tools and servers are available to agents.',
      icon: Wrench,
      action: () => scrollToSection(mcpToolsRef),
    },
    {
      title: 'Research Defaults',
      description: 'Tune search, sources, and retrieval behavior.',
      icon: Database,
      action: () => scrollToSection(researchRef),
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
              disabled={isBusy}
              className={cn(
                'rounded-lg border border-border bg-background p-3 text-left transition-colors',
                'hover:border-primary/40 hover:bg-muted/40',
                isBusy && 'cursor-not-allowed opacity-60',
              )}
            >
              <item.icon className="h-4 w-4 text-primary" />
              <div className="mt-3 text-sm font-medium">{item.title}</div>
              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div ref={skillCatalogRef} data-mcp-section="skill-catalog" className="scroll-mt-6">
        <Suspense fallback={<Fallback label="Loading skill catalog..." />}>
          <h3 className="text-lg font-semibold mb-4">Skill Catalog</h3>
          <LazySkillMarketplace />
        </Suspense>
      </div>

      <div ref={mcpToolsRef} data-mcp-section="mcp-tools" className="scroll-mt-6">
        <Suspense fallback={<Fallback label="Loading MCP tools..." />}>
          <LazyMCPToolsSettings />
        </Suspense>
      </div>
      <div
        ref={skillsPluginsRef}
        data-mcp-section="skills-plugins"
        className="scroll-mt-6 border-t border-border pt-6"
      >
        <Suspense fallback={<Fallback label="Loading skills and plugins..." />}>
          <LazySkillsPluginsSettings />
        </Suspense>
      </div>
      <div className="pt-6 border-t border-border scroll-mt-6" data-mcp-section="mcp-server">
        <Suspense fallback={<Fallback label="Loading MCP server settings..." />}>
          <h3 className="text-lg font-semibold mb-4">MCP Server</h3>
          <LazyMCPServerSettings />
        </Suspense>
      </div>
      <div className="pt-6 border-t border-border scroll-mt-6" data-mcp-section="tools">
        <Suspense fallback={<Fallback label="Loading direct tools..." />}>
          <h3 className="text-lg font-semibold mb-4">Tools</h3>
          <div className="flex min-h-[460px] flex-col">
            <LazyToolsPanel />
          </div>
        </Suspense>
      </div>
      <div
        ref={researchRef}
        data-mcp-section="research"
        className="scroll-mt-6 border-t border-border pt-6"
      >
        <Suspense fallback={<Fallback label="Loading research settings..." />}>
          <h3 className="text-lg font-semibold mb-4">Research</h3>
          <LazyResearchSettings />
        </Suspense>
      </div>
    </div>
  );
}
