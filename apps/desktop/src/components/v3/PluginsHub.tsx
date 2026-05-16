import { lazy, Suspense, useState } from 'react';
import { ArrowRight, Box, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

// PluginMarketplace overlay is owned by desktop-overlays — lazy-imported
const PluginMarketplace = lazy(() =>
  import('./PluginMarketplace').then((m) => ({ default: m.PluginMarketplace })),
);

// ── data ──────────────────────────────────────────────────────────────────────

interface Plugin {
  id: string;
  name: string;
  desc: string;
  color: string;
  icon: string;
  installs: string;
  installed: boolean;
  type: 'Built-in' | 'MCP' | 'Community' | 'Marketplace';
}

const PLUGINS: Plugin[] = [
  {
    id: 'calc',
    name: 'Calculator',
    desc: 'Exact arithmetic without LLM math errors',
    color: '#21808d',
    icon: '⊕',
    installs: '—',
    installed: true,
    type: 'Built-in',
  },
  {
    id: 'py',
    name: 'Python Sandbox',
    desc: 'Run Python in an isolated container',
    color: '#3b82f6',
    icon: '⬡',
    installs: '—',
    installed: true,
    type: 'Built-in',
  },
  {
    id: 'img',
    name: 'Image Generation',
    desc: 'Multi-provider image creation (routed by tier)',
    color: '#da7756',
    icon: '◈',
    installs: '—',
    installed: true,
    type: 'Built-in',
  },
  {
    id: 'ts',
    name: 'TypeScript REPL',
    desc: 'Bun-powered TS execution in a sandbox',
    color: '#0284c7',
    icon: '◉',
    installs: '—',
    installed: true,
    type: 'Built-in',
  },
  {
    id: 'ck',
    name: 'Citation Checker',
    desc: 'Verify URLs in research answers',
    color: '#7c3aed',
    icon: '✓',
    installs: '38.2K',
    installed: true,
    type: 'Community',
  },
  {
    id: 'mcp',
    name: 'Filesystem MCP',
    desc: 'Read/write files in /workspace via MCP stdio',
    color: '#6b7280',
    icon: '⚙',
    installs: '—',
    installed: false,
    type: 'MCP',
  },
  // featured / not installed
  {
    id: 'legal',
    name: 'Legal Assistant',
    desc: 'Contract review, clause extraction, and legal research',
    color: '#1e40af',
    icon: '⚖',
    installs: '12.4K',
    installed: false,
    type: 'Marketplace',
  },
  {
    id: 'data',
    name: 'Data Analyst',
    desc: 'CSV/JSON parsing, statistical analysis, and chart generation',
    color: '#059669',
    icon: '◐',
    installs: '29.1K',
    installed: false,
    type: 'Marketplace',
  },
  {
    id: 'seo',
    name: 'SEO Optimizer',
    desc: 'Keyword research, meta-tag generation, and content scoring',
    color: '#d97706',
    icon: '◑',
    installs: '8.7K',
    installed: false,
    type: 'Marketplace',
  },
  {
    id: 'email',
    name: 'Email Marketer',
    desc: 'Sequence builder, subject-line tester, and deliverability hints',
    color: '#db2777',
    icon: '✉',
    installs: '6.3K',
    installed: false,
    type: 'Marketplace',
  },
  {
    id: 'finance',
    name: 'Finance Analyst',
    desc: 'Earnings summaries, DCF models, and ratio analysis',
    color: '#16a34a',
    icon: '₿',
    installs: '4.9K',
    installed: false,
    type: 'Marketplace',
  },
  {
    id: 'docs',
    name: 'Docs Generator',
    desc: 'Auto-generate API docs, changelogs, and READMEs from code',
    color: '#7c3aed',
    icon: '◧',
    installs: '18.2K',
    installed: false,
    type: 'Marketplace',
  },
];

// ── PluginsHub ────────────────────────────────────────────────────────────────

export function PluginsHub() {
  const [showDirectory, setShowDirectory] = useState(false);

  const installed = PLUGINS.filter((p) => p.installed);
  const featured = PLUGINS.filter((p) => !p.installed).slice(0, 6);

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      {/* installed */}
      <div className="mb-4">
        <h2 className="font-serif text-lg font-medium text-[var(--chat-text-primary,#1a1a1a)] mb-1">
          Installed plugins
        </h2>
        <p className="text-xs text-[var(--chat-text-tertiary,#9e9488)]">
          Server-side tools AGI can call mid-response. Different from connectors — plugins don't
          need an account.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 mb-8">
        {installed.map((p) => (
          <PluginCard key={p.id} plugin={p} />
        ))}
      </div>

      {/* featured */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-lg font-medium text-[var(--chat-text-primary,#1a1a1a)]">
          Featured in the directory
        </h2>
        <button
          onClick={() => setShowDirectory(true)}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)] px-3 py-1.5 text-xs text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-bg-soft,#f5f0e8)] transition-colors"
        >
          <Search size={11} />
          Browse all plugins
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 mb-8">
        {featured.map((p) => (
          <button
            key={p.id}
            onClick={() => setShowDirectory(true)}
            className="flex flex-col items-center gap-2 rounded-xl border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)] p-4 text-center hover:bg-[var(--chat-bg-soft,#f5f0e8)] transition-colors group"
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white text-base"
              style={{ background: p.color }}
            >
              {p.icon}
            </div>
            <div className="text-xs font-medium text-[var(--chat-text-primary,#1a1a1a)] truncate w-full">
              {p.name}
            </div>
            <div className="flex items-center gap-0.5 text-[11px] text-[var(--chat-text-tertiary,#9e9488)] group-hover:text-[var(--chat-teal,#21808d)] transition-colors">
              View <ArrowRight size={10} />
            </div>
          </button>
        ))}
      </div>

      {/* browse CTA */}
      <div className="flex justify-center">
        <button
          onClick={() => setShowDirectory(true)}
          className="flex items-center gap-2 rounded-xl bg-[var(--chat-teal,#21808d)] px-5 py-2.5 text-sm text-white hover:opacity-90 transition-opacity"
        >
          <Box size={14} />
          Browse all plugins
        </button>
      </div>

      {/* marketplace overlay — owned by desktop-overlays, lazy-loaded */}
      {showDirectory && (
        <Suspense fallback={null}>
          <PluginMarketplace onClose={() => setShowDirectory(false)} />
        </Suspense>
      )}
    </div>
  );
}

// ── PluginCard ────────────────────────────────────────────────────────────────

function PluginCard({ plugin: p }: { plugin: Plugin }) {
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
          <div className="text-xs text-[var(--chat-text-tertiary,#9e9488)]">{p.type}</div>
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
          {enabled ? 'Enabled' : 'Off'}
        </div>
      </div>
      <p className="text-xs text-[var(--chat-text-secondary,#6b6157)] mb-3">{p.desc}</p>
      <button
        onClick={() => setEnabled((v) => !v)}
        className="w-full rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] px-3 py-1.5 text-xs text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-border,#e8e3db)] transition-colors"
      >
        {enabled ? 'Disable' : 'Enable'}
      </button>
    </div>
  );
}
