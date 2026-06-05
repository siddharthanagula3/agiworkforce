import { Suspense, lazy, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Globe2, KeyRound, Loader2, ServerCog, ShieldCheck } from 'lucide-react';

const LazyMcpSkillsTab = lazy(() =>
  import('../settings/tabs/McpSkills').then((m) => ({ default: m.McpSkillsTab })),
);
const LazyConnectorsTab = lazy(() =>
  import('../settings/tabs/Connectors').then((m) => ({ default: m.ConnectorsTab })),
);
const LazyMCPToolsSettings = lazy(() =>
  import('../settings/MCPToolsSettings').then((m) => ({ default: m.MCPToolsSettings })),
);
const LazySkillsPluginsSettings = lazy(() =>
  import('../settings/SkillsPluginsSettings').then((m) => ({ default: m.SkillsPluginsSettings })),
);
const LazyMCPServerSettings = lazy(() =>
  import('../settings/MCPServerSettings').then((m) => ({ default: m.MCPServerSettings })),
);

type HubTab = 'Skills' | 'Connectors' | 'Plugins';

const TABS: HubTab[] = ['Skills', 'Connectors', 'Plugins'];
const TAB_KEYS: Record<HubTab, string> = {
  Skills: 'customize.tabs.skills',
  Connectors: 'customize.tabs.connectors',
  Plugins: 'customize.tabs.plugins',
};

const BOUNDARY_NOTES = [
  {
    Icon: Globe2,
    label: 'Web access',
    detail: 'Search, browser, and web skills can run in Local or BYOK mode when enabled.',
  },
  {
    Icon: KeyRound,
    label: 'Provider keys',
    detail: 'BYOK calls your selected provider directly; AGI storage stays local.',
  },
  {
    Icon: ShieldCheck,
    label: 'Cloud separate',
    detail: 'AGI Cloud sign-in is only for hosted storage, sync, subscriptions, and top-ups.',
  },
];

export interface CustomizeHubProps {
  defaultTab?: HubTab;
  className?: string;
}

export function CustomizeHub({ defaultTab = 'Skills', className }: CustomizeHubProps) {
  const { t } = useTranslation('v3');
  const [tab, setTab] = useState<HubTab>(defaultTab);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  const fallback = (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] px-4 py-3 text-sm text-[var(--chat-text-secondary,#6b6157)]">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Loading real local configuration...</span>
    </div>
  );

  return (
    <div className={cn('flex h-full flex-col bg-[var(--chat-bg,#fcfaf6)]', className)}>
      {/* header */}
      <div className="border-b border-[var(--chat-border,#e8e3db)] px-6 pt-5 pb-0">
        <div className="flex items-start gap-4">
          <div className="mr-6 min-w-0">
            <h1 className="font-serif text-2xl font-medium text-[var(--chat-text-primary,#1a1a1a)]">
              {t('customize.title')}
            </h1>
            <p className="text-xs text-[var(--chat-text-secondary,#6b6157)] mt-0.5 max-w-2xl">
              {t('customize.subtitle')}
            </p>
          </div>
          <div className="flex gap-0.5 ml-auto pb-px">
            {TABS.map((tabId) => (
              <button
                key={tabId}
                onClick={() => setTab(tabId)}
                className={cn(
                  'relative rounded-t-lg px-4 py-2 text-sm transition-colors',
                  tab === tabId
                    ? 'bg-[var(--chat-bg,#fcfaf6)] text-[var(--chat-text-primary,#1a1a1a)] font-medium border border-b-0 border-[var(--chat-border,#e8e3db)]'
                    : 'text-[var(--chat-text-secondary,#6b6157)] hover:text-[var(--chat-text-primary,#1a1a1a)]',
                )}
              >
                {t(TAB_KEYS[tabId])}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 mb-3 grid gap-2 lg:grid-cols-3">
          {BOUNDARY_NOTES.map(({ Icon, label, detail }) => (
            <div
              key={label}
              className="flex min-w-0 gap-2 rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] px-3 py-2"
            >
              <Icon
                size={14}
                className="mt-0.5 shrink-0 text-[var(--chat-teal,#21808d)]"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-[var(--chat-text-primary,#1a1a1a)]">
                  {label}
                </div>
                <div className="text-[11px] leading-snug text-[var(--chat-text-tertiary,#9e9488)]">
                  {detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Suspense fallback={fallback}>
          {tab === 'Skills' && (
            <LazyMcpSkillsTab isBusy={false} onOpenConnectors={() => setTab('Connectors')} />
          )}
          {tab === 'Connectors' && (
            <LazyConnectorsTab isBusy={false} onOpenMcpSkills={() => setTab('Skills')} />
          )}
          {tab === 'Plugins' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] p-4">
                <div className="flex items-start gap-3">
                  <ServerCog className="mt-0.5 h-4 w-4 text-[var(--chat-teal,#21808d)]" />
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--chat-text-primary,#1a1a1a)]">
                      Plugins and MCP servers
                    </h3>
                    <p className="mt-1 text-sm text-[var(--chat-text-secondary,#6b6157)]">
                      Real installed plugins, project skills, MCP tools, and the local AGI MCP
                      server. No demo catalog rows or UI-only toggles.
                    </p>
                  </div>
                </div>
              </div>
              <LazyMCPToolsSettings />
              <div className="pt-6 border-t border-[var(--chat-border,#e8e3db)]">
                <LazySkillsPluginsSettings />
              </div>
              <div className="pt-6 border-t border-[var(--chat-border,#e8e3db)]">
                <LazyMCPServerSettings />
              </div>
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}
