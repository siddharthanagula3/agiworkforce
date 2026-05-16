import { useEffect, useState, useCallback } from 'react';
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
import type { Artifact, ArtifactType } from '@/stores/artifactStore';
import { useMcpStore } from '@/stores/mcpStore';

// ── file tree ─────────────────────────────────────────────────────────────────

interface FileNode {
  name: string;
  open?: boolean;
  content?: string;
  children?: FileNode[];
}

function buildTreeFromFiles(
  files: Array<{ name: string; content: string; language?: string }>,
): FileNode[] {
  const dirs: Record<string, FileNode> = {};
  const roots: FileNode[] = [];

  for (const f of files) {
    const parts = f.name.split('/').filter(Boolean);
    if (parts.length === 1) {
      roots.push({ name: f.name, content: f.content });
    } else {
      const dir = '/' + parts.slice(0, -1).join('/');
      if (!dirs[dir]) {
        dirs[dir] = { name: dir, open: true, children: [] };
        roots.push(dirs[dir]);
      }
      dirs[dir].children!.push({ name: parts[parts.length - 1]!, content: f.content });
    }
  }
  return roots;
}

function singleFileTree(artifact: Artifact): FileNode[] {
  const name = artifact.title ?? 'artifact';
  return [{ name, content: artifact.content }];
}

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

// ── KPI preview (for chart artifacts) ────────────────────────────────────────

interface KpiEntry {
  label: string;
  value: string;
  delta?: string;
  trend?: 'up' | 'down';
  sparkline?: number[];
  color?: string;
}

function KPIPreview({ content }: { content: string }) {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // not JSON — render raw
  }

  const COLORS = ['#21808d', '#da7756', '#3a7daa', '#1b8a5a'];
  const kpis = Array.isArray(parsed?.['kpis']) ? (parsed['kpis'] as KpiEntry[]) : [];

  if (!parsed || kpis.length === 0) {
    return (
      <div className="p-5">
        <pre className="whitespace-pre-wrap font-mono text-xs text-[var(--chat-text-primary,#1a1a1a)]">
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="grid grid-cols-2 gap-3">
        {kpis.map((kpi, i) => (
          <div
            key={kpi.label}
            className="rounded-lg border border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] p-3"
          >
            <div className="text-xs text-[var(--chat-text-secondary,#6b6157)] mb-1">
              {kpi.label}
            </div>
            <div className="font-mono text-lg font-semibold text-[var(--chat-text-primary,#1a1a1a)]">
              {kpi.value}
            </div>
            {kpi.delta && (
              <div
                className={cn(
                  'text-xs mt-0.5',
                  kpi.trend === 'up' ? 'text-emerald-600' : 'text-red-500',
                )}
              >
                {kpi.trend === 'up' ? '↑' : '↓'} {kpi.delta}
              </div>
            )}
            {kpi.sparkline && (
              <div className="mt-2">
                <Spark values={kpi.sparkline} color={kpi.color ?? COLORS[i % COLORS.length]!} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── code view ─────────────────────────────────────────────────────────────────

function CodeView({ content }: { content: string }) {
  const lines = content.split('\n');
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

// ── markdown/document view ────────────────────────────────────────────────────

function MarkdownView({ content }: { content: string }) {
  return (
    <div className="h-full overflow-auto p-6">
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--chat-text-primary,#1a1a1a)]">
        {content}
      </pre>
    </div>
  );
}

// ── HTML / web view ───────────────────────────────────────────────────────────

function HtmlView({ content }: { content: string }) {
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  return (
    <div className="h-full overflow-hidden">
      <iframe
        src={url}
        className="h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin"
        title="HTML preview"
      />
    </div>
  );
}

// ── image view ────────────────────────────────────────────────────────────────

function ImageView({ content }: { content: string }) {
  const src =
    content.startsWith('data:') || content.startsWith('http')
      ? content
      : `data:image/png;base64,${content}`;
  return (
    <div className="h-full overflow-auto p-6 flex items-center justify-center">
      <img src={src} alt="artifact" className="max-w-full max-h-full object-contain rounded-lg" />
    </div>
  );
}

// ── share view ────────────────────────────────────────────────────────────────

function ShareView({ artifactId }: { artifactId?: string }) {
  const [copied, setCopied] = useState(false);
  const link = artifactId ? `https://agi.app/a/${artifactId}` : 'https://agi.app/a/draft';

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
                node.children!.map((child) => (
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

// ── content renderer by type ──────────────────────────────────────────────────

function resolveTabContent(
  tab: Tab,
  type: ArtifactType,
  activeContent: string,
  artifactId?: string,
) {
  if (tab === 'Share') return <ShareView artifactId={artifactId} />;

  if (tab === 'Code') {
    return <CodeView content={activeContent} />;
  }

  // Preview tab — render based artifact type
  switch (type) {
    case 'code':
    case 'diagram':
    case 'spreadsheet':
    case 'presentation':
      return <CodeView content={activeContent} />;
    case 'web':
      return <HtmlView content={activeContent} />;
    case 'document':
      return <MarkdownView content={activeContent} />;
    case 'image':
      return <ImageView content={activeContent} />;
    case 'chart':
      return <KPIPreview content={activeContent} />;
    default:
      return <MarkdownView content={activeContent} />;
  }
}

// ── MCP banner ────────────────────────────────────────────────────────────────

function McpBanner() {
  const servers = useMcpStore((s) => s.servers);
  const connected = servers.filter((s) => s.connected);

  if (connected.length === 0) return null;

  const names = connected.slice(0, 3).map((s) => s.name);
  const extra = connected.length > 3 ? ` +${connected.length - 3}` : '';

  return (
    <div className="flex items-center gap-2 border-t border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg-soft,#f5f0e8)] px-4 py-1.5 text-xs text-[var(--chat-text-secondary,#6b6157)] shrink-0">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      <span>
        Connected:{' '}
        {names.map((n, i) => (
          <span key={n}>
            {i > 0 && ', '}
            <span className="text-[var(--chat-text-primary,#1a1a1a)]">{n}</span>
          </span>
        ))}
        {extra && <span>{extra}</span>}
      </span>
      <button className="ml-auto flex items-center gap-0.5 hover:text-[var(--chat-text-primary,#1a1a1a)] transition-colors">
        Manage
        <ChevronRight size={10} />
      </button>
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
 * When `artifactId` is provided it loads the real artifact from useArtifactStore
 * and renders based on artifact_type (code, document, web, chart, image, etc.).
 * Multi-file artifacts use files array from metadata. Single-file uses artifact.content.
 * MCP banner reads connected servers from useMcpStore.
 */
export function ArtifactWorkspace({ artifactId, className, onClose }: ArtifactWorkspaceProps) {
  const [tab, setTab] = useState<Tab>('Preview');
  const [activeFile, setActiveFile] = useState('');
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { getArtifact } = useArtifactStore();

  const loadArtifact = useCallback(async () => {
    if (!artifactId) return;
    setIsLoading(true);
    try {
      const a = await getArtifact(artifactId);
      setArtifact(a);
      if (a) {
        const meta = a.metadata as Record<string, unknown> | null;
        const files = meta?.['files'] as Array<{ name: string; content: string }> | undefined;
        if (files && files.length > 0) {
          setActiveFile(files[0]!.name);
        } else {
          setActiveFile(a.title ?? 'artifact');
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [artifactId, getArtifact]);

  useEffect(() => {
    void loadArtifact();
  }, [loadArtifact]);

  // Derive file tree and file content map from real artifact
  const { fileTree, fileMap } = (() => {
    if (!artifact) return { fileTree: [] as FileNode[], fileMap: {} as Record<string, string> };
    const meta = artifact.metadata as Record<string, unknown> | null;
    const files = meta?.['files'] as
      | Array<{ name: string; content: string; language?: string }>
      | undefined;
    if (files && files.length > 0) {
      const tree = buildTreeFromFiles(files);
      const map: Record<string, string> = {};
      for (const f of files) map[f.name] = f.content;
      return { fileTree: tree, fileMap: map };
    }
    const tree = singleFileTree(artifact);
    return { fileTree: tree, fileMap: { [artifact.title ?? 'artifact']: artifact.content } };
  })();

  const fileCount = Object.keys(fileMap).length;
  const title = artifact?.title ?? (artifactId ? 'Loading…' : 'No artifact selected');
  const typeLabel = artifact?.artifact_type ?? '';
  const activeContent = fileMap[activeFile] ?? artifact?.content ?? '';

  const TABS: Tab[] = ['Preview', 'Code', 'Share'];

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(activeContent);
    } catch {
      // clipboard unavailable
    }
  }, [activeContent]);

  return (
    <div
      className={cn(
        'flex h-full border-l border-[var(--chat-border,#e8e3db)] bg-[var(--chat-bg,#fcfaf6)]',
        className,
      )}
    >
      {/* file tree — 160px */}
      <div className="w-40 shrink-0 border-r border-[var(--chat-border,#e8e3db)] overflow-y-auto">
        {fileTree.length > 0 ? (
          <FileTree nodes={fileTree} activeFile={activeFile} onSelect={setActiveFile} />
        ) : (
          <div className="p-3 text-xs text-[var(--chat-text-tertiary,#9e9488)]">
            {isLoading ? 'Loading…' : 'No files'}
          </div>
        )}
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
              onClick={() => void loadArtifact()}
              className="rounded p-1.5 text-[var(--chat-text-secondary,#6b6157)] hover:bg-[var(--chat-bg-soft,#f5f0e8)] hover:text-[var(--chat-text-primary,#1a1a1a)] transition-colors"
              title="Refresh"
            >
              <RefreshCw size={12} />
            </button>
            <button
              onClick={() => void handleCopy()}
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
          {typeLabel && (
            <span className="text-[10px] text-[var(--chat-text-tertiary,#9e9488)]">
              {typeLabel} · {fileCount} {fileCount === 1 ? 'file' : 'files'}
            </span>
          )}
        </div>

        {/* content area */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-xs text-[var(--chat-text-muted,#9e9488)]">
              Loading artifact…
            </div>
          ) : !artifact ? (
            <div className="flex h-full items-center justify-center text-xs text-[var(--chat-text-muted,#9e9488)]">
              {artifactId ? 'Artifact not found' : 'Open an artifact to preview it here'}
            </div>
          ) : (
            resolveTabContent(tab, artifact.artifact_type, activeContent, artifact.id)
          )}
        </div>

        {/* MCP banner — shows connected servers */}
        <McpBanner />
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
