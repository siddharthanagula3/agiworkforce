import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  File,
  Folder,
  Play,
  Plus,
  RefreshCw,
  Share2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useArtifactStore } from '@/stores/artifactStore';

// ── file tree ─────────────────────────────────────────────────────────────────

interface FileNode {
  name: string;
  open?: boolean;
  children?: FileNode[];
}

const DEMO_TREE: FileNode[] = [
  {
    name: '/src',
    open: true,
    children: [{ name: 'index.tsx' }, { name: 'App.tsx' }, { name: 'utils.ts' }],
  },
  {
    name: '/styles',
    open: true,
    children: [{ name: 'main.css' }],
  },
  {
    name: '/public',
    open: false,
    children: [],
  },
];

const CODE_SAMPLES: Record<string, string> = {
  'App.tsx': `import { useState } from 'react'
import { KPI, Spark } from './utils'
import './styles/main.css'

export default function App() {
  const [range, setRange] = useState<'month' | 'last'>('month')

  return (
    <main className="dashboard">
      <header>
        <h1>Quarterly performance</h1>
        <Toggle value={range} onChange={setRange} />
      </header>

      <KPI label="Conversion" value="5.42%" delta="+0.8pp" />
      <KPI label="Revenue (MRR)" value="$248,310" delta="+12.4%" />
      <KPI label="Active users" value="18,920" delta="+6.1%" />
      <KPI label="Churn" value="2.1%" delta="-0.4pp" />
    </main>
  )
}`,
  'index.tsx': `import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)`,
  'utils.ts': `export const fmt = (n: number) =>
  new Intl.NumberFormat('en-US').format(n)

export const pct = (n: number) =>
  \`\${(n * 100).toFixed(2)}%\``,
  'main.css': `:root {
  --bg: #fcfaf6;
  --ink: #1a1a1a;
  --teal: #21808d;
  --terracotta: #da7756;
}
.dashboard { font-family: 'Source Serif 4', serif; }`,
};

// ── sparkline ─────────────────────────────────────────────────────────────────

function Spark({ values, color }: { values: number[]; color: string }) {
  const w = 90;
  const h = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values
    .map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`)
    .join(' ');
  const lastVal = values[values.length - 1] ?? 0;
  const lastX = (values.length - 1) * step;
  const lastY = h - ((lastVal - min) / range) * (h - 4) - 2;
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  );
}

// ── KPI preview ───────────────────────────────────────────────────────────────

type RangeKey = 'month' | 'last';

const KPI_DATA: Record<
  RangeKey,
  {
    conversion: { v: string; d: string; trend: 'up' | 'down' };
    revenue: { v: string; d: string; trend: 'up' | 'down' };
    users: { v: string; d: string; trend: 'up' | 'down' };
    churn: { v: string; d: string; trend: 'up' | 'down' };
    q: number;
  }
> = {
  month: {
    conversion: { v: '5.42%', d: '+0.8 pp', trend: 'up' },
    revenue: { v: '$248,310', d: '+12.4%', trend: 'up' },
    users: { v: '18,920', d: '+6.1%', trend: 'up' },
    churn: { v: '2.1%', d: '−0.4 pp', trend: 'up' },
    q: 68,
  },
  last: {
    conversion: { v: '4.62%', d: '+0.2 pp', trend: 'up' },
    revenue: { v: '$220,990', d: '+3.0%', trend: 'up' },
    users: { v: '17,830', d: '+2.4%', trend: 'up' },
    churn: { v: '2.5%', d: '+0.1 pp', trend: 'down' },
    q: 52,
  },
};

function KPIPreview({ range, setRange }: { range: RangeKey; setRange: (r: RangeKey) => void }) {
  const d = KPI_DATA[range];
  return (
    <div className="p-5">
      {/* header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-serif text-base font-medium text-[var(--chat-text-primary,#1a1a1a)]">
          Quarterly performance
        </h3>
        <div className="flex rounded-md border border-[var(--chat-border,#e8e3db)] overflow-hidden text-xs">
          <button
            onClick={() => setRange('month')}
            className={cn(
              'px-3 py-1.5 transition-colors',
              range === 'month'
                ? 'bg-[var(--chat-teal,#21808d)] text-white'
                : 'bg-[var(--chat-bg,#fcfaf6)] text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-bg-soft,#f5f0e8)]',
            )}
          >
            This month
          </button>
          <button
            onClick={() => setRange('last')}
            className={cn(
              'px-3 py-1.5 transition-colors',
              range === 'last'
                ? 'bg-[var(--chat-teal,#21808d)] text-white'
                : 'bg-[var(--chat-bg,#fcfaf6)] text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-bg-soft,#f5f0e8)]',
            )}
          >
            Last month
          </button>
        </div>
      </div>

      {/* stat grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {(
          [
            {
              label: 'Conversion',
              stat: d.conversion,
              values: [3.8, 4.0, 4.2, 4.5, 4.8, 4.6, 5.1, 5.42],
              color: '#21808d',
            },
            {
              label: 'Revenue (MRR)',
              stat: d.revenue,
              values: [190, 198, 205, 212, 220, 228, 238, 248],
              color: '#da7756',
            },
            {
              label: 'Active users',
              stat: d.users,
              values: [16.2, 16.5, 17.0, 17.4, 17.9, 18.2, 18.5, 18.9],
              color: '#3a7daa',
            },
            {
              label: 'Churn',
              stat: d.churn,
              values: [3.0, 2.8, 2.6, 2.5, 2.4, 2.3, 2.2, 2.1],
              color: '#1b8a5a',
            },
          ] as const
        ).map(({ label, stat, values, color }) => (
          <div
            key={label}
            className="rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] p-3"
          >
            <div className="text-xs text-[var(--chat-text-secondary,#6b6157)] mb-1">{label}</div>
            <div className="font-mono text-lg font-semibold text-[var(--chat-text-primary,#1a1a1a)]">
              {stat.v}
            </div>
            <div
              className={cn(
                'text-xs mt-0.5',
                stat.trend === 'up' ? 'text-emerald-600' : 'text-red-500',
              )}
            >
              {stat.trend === 'up' ? '↑' : '↓'} {stat.d} vs last period
            </div>
            <div className="mt-2">
              <Spark values={values as unknown as number[]} color={color} />
            </div>
          </div>
        ))}
      </div>

      {/* progress bar */}
      <div className="rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-[var(--chat-text-primary,#1a1a1a)]">
            Q1 progress to plan
          </span>
          <span className="font-mono text-xs text-[var(--chat-text-secondary,#6b6157)]">
            {d.q}% · $1.49M of $2.2M ARR
          </span>
        </div>
        <div className="h-2 flex rounded-full overflow-hidden">
          <div
            style={{ width: `${d.q}%`, background: 'linear-gradient(90deg, #21808d, #da7756)' }}
          />
          <div style={{ width: `${100 - d.q}%` }} className="bg-[var(--chat-border,#e8e3db)]" />
        </div>
        <div className="flex justify-between mt-1.5 font-mono text-[10px] text-[var(--chat-text-tertiary,#9e9488)]">
          <span>Jan 1</span>
          <span>Mar 31</span>
        </div>
      </div>
    </div>
  );
}

// ── code view ─────────────────────────────────────────────────────────────────

function CodeView({ file }: { file: string }) {
  const src = CODE_SAMPLES[file] ?? '// Empty file';
  const lines = src.split('\n');
  return (
    <div className="h-full overflow-auto p-4">
      <pre className="m-0 rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] p-4 font-mono text-xs leading-relaxed text-[var(--chat-text-primary,#1a1a1a)]">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-8 shrink-0 pr-3 text-right text-[var(--chat-text-tertiary,#9e9488)] select-none">
              {i + 1}
            </span>
            <span className="whitespace-pre">{line}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}

// ── share view ────────────────────────────────────────────────────────────────

function ShareView() {
  const [copied, setCopied] = useState(false);
  const link = 'https://agi.app/a/9f1c-kpi-dashboard';

  const handleCopy = () => {
    void navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="p-5 max-w-[520px] mx-auto">
      <h3 className="font-serif text-xl font-medium mt-0 mb-1 text-[var(--chat-text-primary,#1a1a1a)]">
        Share this artifact
      </h3>
      <p className="text-xs text-[var(--chat-text-secondary,#6b6157)] mb-4">
        Anyone with the link can view, but not run code. Conversation stays private.
      </p>
      <div className="flex gap-2 mb-5">
        <div className="flex-1 rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] px-3 py-2 font-mono text-xs text-[var(--chat-text-secondary,#6b6157)] truncate">
          {link}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)] px-3 py-2 text-xs text-[var(--chat-text-primary,#1a1a1a)] hover:bg-[var(--chat-bg-soft,#f5f0e8)] transition-colors"
        >
          <Copy size={12} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] p-4">
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="shrink-0 text-[var(--chat-text-secondary,#6b6157)]"
        >
          <rect x={3} y={11} width={18} height={11} rx={2} ry={2} />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div>
          <div className="text-sm font-medium text-[var(--chat-text-primary,#1a1a1a)]">
            Provenance is preserved
          </div>
          <div className="text-xs text-[var(--chat-text-secondary,#6b6157)] mt-0.5">
            Recipients see which model generated this — no spoofing.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── file tree component ───────────────────────────────────────────────────────

function FileTree({
  nodes,
  activeFile,
  onSelect,
}: {
  nodes: FileNode[];
  activeFile: string;
  onSelect: (name: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(nodes.map((n) => [n.name, n.open ?? false])),
  );

  const toggle = (name: string) => setOpen((s) => ({ ...s, [name]: !s[name] }));

  return (
    <div className="py-2">
      {nodes.map((node) => (
        <div key={node.name}>
          {node.children !== undefined ? (
            <>
              <button
                onClick={() => toggle(node.name)}
                className="flex w-full items-center gap-1 px-3 py-1 text-xs text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-bg-soft,#f5f0e8)] transition-colors"
              >
                {open[node.name] ? (
                  <ChevronDown size={10} className="shrink-0" />
                ) : (
                  <ChevronRight size={10} className="shrink-0" />
                )}
                <Folder size={11} className="shrink-0 text-[var(--chat-teal,#21808d)]" />
                <span className="truncate">{node.name}</span>
              </button>
              {open[node.name] &&
                node.children.map((child) => (
                  <button
                    key={child.name}
                    onClick={() => onSelect(child.name)}
                    className={cn(
                      'flex w-full items-center gap-1.5 pl-7 pr-3 py-1 text-xs transition-colors truncate',
                      activeFile === child.name
                        ? 'bg-[var(--chat-teal,#21808d)]/10 text-[var(--chat-teal,#21808d)] font-medium'
                        : 'text-[var(--chat-text-primary,#1a1a1a)] hover:bg-[var(--chat-bg-soft,#f5f0e8)]',
                    )}
                  >
                    <File size={10} className="shrink-0" />
                    <span className="truncate">{child.name}</span>
                  </button>
                ))}
            </>
          ) : (
            <button
              onClick={() => onSelect(node.name)}
              className={cn(
                'flex w-full items-center gap-1.5 px-3 py-1 text-xs transition-colors',
                activeFile === node.name
                  ? 'bg-[var(--chat-teal,#21808d)]/10 text-[var(--chat-teal,#21808d)] font-medium'
                  : 'text-[var(--chat-text-primary,#1a1a1a)] hover:bg-[var(--chat-bg-soft,#f5f0e8)]',
              )}
            >
              <File size={10} className="shrink-0" />
              <span className="truncate">{node.name}</span>
            </button>
          )}
        </div>
      ))}
      <div className="mt-2 border-t border-[var(--chat-border,#e8e3db)] pt-2 px-3">
        <button className="flex items-center gap-1 text-xs text-[var(--chat-text-secondary,#6b6157)] hover:text-[var(--chat-text-primary,#1a1a1a)] transition-colors">
          <Plus size={11} />
          New file
        </button>
      </div>
    </div>
  );
}

// ── ArtifactWorkspace ─────────────────────────────────────────────────────────

export interface ArtifactWorkspaceProps {
  artifactId?: string;
  className?: string;
  onClose?: () => void;
}

type Tab = 'Preview' | 'Code' | 'Share';

/**
 * v3 multi-file artifact workspace.
 *
 * Split-pane layout: left = chat (rendered by caller), right = file tree (160px)
 * + tabbed editor [Preview][Code][Share] + MCP-connected banner.
 *
 * This component owns the RIGHT pane only. The caller is responsible for
 * rendering the chat pane on the left inside a split-pane container.
 *
 * When `artifactId` is provided, data from `useArtifactStore` drives the title;
 * otherwise the demo KPI dashboard is shown.
 */
export function ArtifactWorkspace({ artifactId, className, onClose }: ArtifactWorkspaceProps) {
  const [activeFile, setActiveFile] = useState('App.tsx');
  const [tab, setTab] = useState<Tab>('Preview');
  const [range, setRange] = useState<RangeKey>('month');

  const { getArtifact } = useArtifactStore();
  const [artifactTitle, setArtifactTitle] = useState<string | null>(null);
  useEffect(() => {
    if (!artifactId) return;
    void getArtifact(artifactId).then((a) => {
      if (a) setArtifactTitle(a.title ?? null);
    });
  }, [artifactId, getArtifact]);
  const title = artifactTitle ?? 'KPI dashboard';

  const TABS: Tab[] = ['Preview', 'Code', 'Share'];

  return (
    <div
      className={cn(
        'flex h-full border-l border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)]',
        className,
      )}
    >
      {/* file tree — 160px */}
      <div className="w-40 shrink-0 border-r border-[var(--chat-border,#e8e3db)] overflow-y-auto">
        <FileTree nodes={DEMO_TREE} activeFile={activeFile} onSelect={setActiveFile} />
      </div>

      {/* main pane */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* tab bar */}
        <div className="flex items-center border-b border-[var(--chat-border,#e8e3db)] px-2 h-10 shrink-0">
          <div className="flex items-center gap-0.5 flex-1">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
                  tab === t
                    ? 'bg-[var(--chat-bg-soft,#f5f0e8)] text-[var(--chat-text-primary,#1a1a1a)] font-medium'
                    : 'text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-bg-soft,#f5f0e8)]',
                )}
              >
                {t === 'Preview' && <Play size={10} />}
                {t === 'Code' && <Code2 size={10} />}
                {t === 'Share' && <Share2 size={10} />}
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              className="rounded p-1.5 text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-bg-soft,#f5f0e8)] hover:text-[var(--chat-text-primary,#1a1a1a)] transition-colors"
              title="Refresh"
            >
              <RefreshCw size={12} />
            </button>
            <button
              className="rounded p-1.5 text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-bg-soft,#f5f0e8)] hover:text-[var(--chat-text-primary,#1a1a1a)] transition-colors"
              title="Copy"
            >
              <Copy size={12} />
            </button>
            <button
              className="rounded p-1.5 text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-bg-soft,#f5f0e8)] hover:text-[var(--chat-text-primary,#1a1a1a)] transition-colors"
              title="Open externally"
            >
              <ExternalLink size={12} />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="rounded p-1.5 text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-bg-soft,#f5f0e8)] hover:text-[var(--chat-text-primary,#1a1a1a)] transition-colors"
                title="Close"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* title strip */}
        <div className="flex items-center gap-2 border-b border-[var(--chat-border,#e8e3db)] px-4 py-2 shrink-0">
          <span className="text-xs font-medium text-[var(--chat-text-primary,#1a1a1a)] truncate">
            {title}
          </span>
          <span className="text-[10px] text-[var(--chat-text-tertiary,#9e9488)]">
            interactive · 4 files
          </span>
        </div>

        {/* content area */}
        <div className="flex-1 overflow-auto">
          {tab === 'Preview' && <KPIPreview range={range} setRange={setRange} />}
          {tab === 'Code' && <CodeView file={activeFile} />}
          {tab === 'Share' && <ShareView />}
        </div>

        {/* MCP banner */}
        <div className="flex items-center gap-2 border-t border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] px-4 py-1.5 text-xs text-[var(--chat-text-secondary,#6b6157)] shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>
            Connected: <span className="text-[var(--chat-text-primary,#1a1a1a)]">Gmail</span>,{' '}
            <span className="text-[var(--chat-text-primary,#1a1a1a)]">Calendar</span>
          </span>
          <button className="ml-auto flex items-center gap-0.5 hover:text-[var(--chat-text-primary,#1a1a1a)] transition-colors">
            Manage
            <ChevronRight size={10} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ArtifactWorkspaceLayout ───────────────────────────────────────────────────
// Full split-pane wrapper: left slot (chat) + right ArtifactWorkspace.

export interface ArtifactWorkspaceLayoutProps {
  chatSlot: React.ReactNode;
  artifactId?: string;
  onClose?: () => void;
  className?: string;
}

export function ArtifactWorkspaceLayout({
  chatSlot,
  artifactId,
  onClose,
  className,
}: ArtifactWorkspaceLayoutProps) {
  return (
    <div className={cn('flex h-full w-full', className)}>
      {/* chat side — 50% */}
      <div className="flex-1 min-w-0 overflow-hidden">{chatSlot}</div>
      {/* artifact side — 50% */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <ArtifactWorkspace artifactId={artifactId} onClose={onClose} className="h-full" />
      </div>
    </div>
  );
}
