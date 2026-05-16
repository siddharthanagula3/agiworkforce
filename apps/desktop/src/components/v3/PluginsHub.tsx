import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Box, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMcpStore } from '../../stores/mcpStore';
import type { McpServerInfo, McpRegistryPackage } from '../../types/mcp';

const PluginMarketplace = lazy(() =>
  import('./PluginMarketplace').then((m) => ({ default: m.PluginMarketplace })),
);

// ── static built-ins ──────────────────────────────────────────────────────────

interface BuiltInPlugin {
  id: string;
  name: string;
  desc: string;
  color: string;
  icon: string;
}

const BUILT_INS: BuiltInPlugin[] = [
  {
    id: 'calc',
    name: 'Calculator',
    desc: 'Exact arithmetic without LLM math errors',
    color: '#21808d',
    icon: '⊕',
  },
  {
    id: 'py',
    name: 'Python Sandbox',
    desc: 'Run Python in an isolated container',
    color: '#3b82f6',
    icon: '⬡',
  },
  {
    id: 'img',
    name: 'Image Generation',
    desc: 'Multi-provider image creation (routed by tier)',
    color: '#da7756',
    icon: '◈',
  },
  {
    id: 'ts',
    name: 'TypeScript REPL',
    desc: 'Bun-powered TS execution in a sandbox',
    color: '#0284c7',
    icon: '◉',
  },
];

// ── BuiltInCard ───────────────────────────────────────────────────────────────

function BuiltInCard({ plugin: p }: { plugin: BuiltInPlugin }) {
  const { t } = useTranslation('v3');
  const [enabled, setEnabled] = useState(true);
  return (
    <div className="rounded-xl border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)] p-4">
      <div className="flex items-center gap-3 mb-2">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white text-base"
          style={{ background: p.color }}
        >
          {p.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--chat-text-primary,#1a1a1a)] truncate">
            {p.name}
          </div>
          <div className="text-xs text-[var(--chat-text-tertiary,#9e9488)]">
            {t('plugins.builtIn')}
          </div>
        </div>
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
            enabled
              ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
              : 'border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] text-[var(--chat-text-tertiary,#9e9488)]',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              enabled ? 'bg-emerald-500' : 'bg-[var(--chat-text-tertiary,#9e9488)]',
            )}
          />
          {enabled ? t('common.enabled') : t('common.off')}
        </div>
      </div>
      <p className="text-xs text-[var(--chat-text-secondary,#6b6157)] mb-3">{p.desc}</p>
      <button
        onClick={() => setEnabled((v) => !v)}
        className="w-full rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] px-3 py-1.5 text-xs text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-border,#e8e3db)] transition-colors"
      >
        {enabled ? t('common.disable') : t('common.enable')}
      </button>
    </div>
  );
}

// ── McpPluginCard ─────────────────────────────────────────────────────────────

function McpPluginCard({ server }: { server: McpServerInfo }) {
  const { t } = useTranslation('v3');
  const { enableServer, disableServer } = useMcpStore();
  const isEnabled = server.connected || server.enabled;

  const toggle = async () => {
    if (isEnabled) {
      await disableServer(server.name);
    } else {
      await enableServer(server.name);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)] p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#6b7280] text-white text-base">
          &#9881;
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--chat-text-primary,#1a1a1a)] truncate">
            {server.name}
          </div>
          <div className="text-xs text-[var(--chat-text-tertiary,#9e9488)]">{t('plugins.mcp')}</div>
        </div>
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
            isEnabled
              ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
              : 'border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] text-[var(--chat-text-tertiary,#9e9488)]',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              isEnabled ? 'bg-emerald-500' : 'bg-[var(--chat-text-tertiary,#9e9488)]',
            )}
          />
          {isEnabled ? t('common.enabled') : t('common.off')}
        </div>
      </div>
      <p className="text-xs text-[var(--chat-text-secondary,#6b6157)] mb-3 line-clamp-2">
        {server.tool_count > 0
          ? t('plugins.toolsAvailable', { count: server.tool_count })
          : t('plugins.mcpServer')}
      </p>
      <button
        onClick={toggle}
        className="w-full rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] px-3 py-1.5 text-xs text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-border,#e8e3db)] transition-colors"
      >
        {isEnabled ? t('common.disable') : t('common.enable')}
      </button>
    </div>
  );
}

// ── FeaturedCard ──────────────────────────────────────────────────────────────

function FeaturedCard({ pkg: p, onView }: { pkg: McpRegistryPackage; onView: () => void }) {
  const { t } = useTranslation('v3');
  return (
    <button
      onClick={onView}
      className="flex flex-col items-center gap-2 rounded-xl border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)] p-4 text-center hover:bg-[var(--chat-bg-soft,#f5f0e8)] transition-colors group"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#6b7280] text-white text-base font-semibold">
        {p.name.charAt(0).toUpperCase()}
      </div>
      <div className="text-xs font-medium text-[var(--chat-text-primary,#1a1a1a)] truncate w-full">
        {p.name}
      </div>
      <div className="flex items-center gap-0.5 text-[11px] text-[var(--chat-text-tertiary,#9e9488)] group-hover:text-[var(--chat-teal,#21808d)] transition-colors">
        {t('common.view')} <ArrowRight size={10} />
      </div>
    </button>
  );
}

// ── PluginsHub ────────────────────────────────────────────────────────────────

export function PluginsHub() {
  const { t } = useTranslation('v3');
  const { servers, registry, isLoading, initialize, isInitialized, refreshRegistry } =
    useMcpStore();
  const [showDirectory, setShowDirectory] = useState(false);

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    } else if (registry.length === 0) {
      refreshRegistry();
    }
  }, [isInitialized]);

  const installedNames = new Set(servers.map((s) => s.name.toLowerCase()));
  const featured = registry.filter((r) => !installedNames.has(r.name.toLowerCase())).slice(0, 6);

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="mb-4">
        <h2 className="font-serif text-lg font-medium text-[var(--chat-text-primary,#1a1a1a)] mb-1">
          {t('plugins.installed')}
        </h2>
        <p className="text-xs text-[var(--chat-text-tertiary,#9e9488)]">
          {t('plugins.installedDesc')}
        </p>
      </div>

      {isLoading && servers.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-[var(--chat-text-tertiary,#9e9488)] mb-8">
          <Loader2 size={14} className="animate-spin" />
          {t('plugins.loading')}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 mb-8">
          {BUILT_INS.map((p) => (
            <BuiltInCard key={p.id} plugin={p} />
          ))}
          {servers.map((s) => (
            <McpPluginCard key={s.name} server={s} />
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-lg font-medium text-[var(--chat-text-primary,#1a1a1a)]">
          {t('plugins.featured')}
        </h2>
        <button
          onClick={() => setShowDirectory(true)}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)] px-3 py-1.5 text-xs text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-bg-soft,#f5f0e8)] transition-colors"
        >
          <Search size={11} />
          {t('plugins.browseAll')}
        </button>
      </div>

      {featured.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 mb-8">
          {featured.map((p) => (
            <FeaturedCard key={p.name} pkg={p} onView={() => setShowDirectory(true)} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--chat-text-tertiary,#9e9488)] mb-8">
          {t('plugins.emptyDirectory')}
        </p>
      )}

      <div className="flex justify-center">
        <button
          onClick={() => setShowDirectory(true)}
          className="flex items-center gap-2 rounded-xl bg-[var(--chat-teal,#21808d)] px-5 py-2.5 text-sm text-white hover:opacity-90 transition-opacity"
        >
          <Box size={14} />
          {t('plugins.browseAll')}
        </button>
      </div>

      {showDirectory && (
        <Suspense fallback={null}>
          <PluginMarketplace onClose={() => setShowDirectory(false)} />
        </Suspense>
      )}
    </div>
  );
}
