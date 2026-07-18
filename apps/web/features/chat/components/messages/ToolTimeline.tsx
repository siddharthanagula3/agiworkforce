'use client';

import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  CircleCheck,
  GitBranch,
  FileText,
  FilePlus2,
  FilePen,
  SquareTerminal,
  FolderOpen,
  Globe,
  BookOpen,
  Search,
  ExternalLink,
  Plug,
  Check,
  Ban,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { ToolCallCard, type ToolCall, type ToolCallStatus } from '../ToolCallCard';
import { FileTypeIcon } from './FileTypeIcon';
import type { ResearchSource } from '../../stores/research-panel-store';
import {
  parseQualifiedMcpToolName,
  describeMcpTool,
} from '@/features/connectors/lib/mcp-tool-name';
import {
  useToolPermissionsStore,
  type PermissionLevel,
} from '@/features/connectors/stores/tool-permissions-store';

// ─── File reference helper ──────────────────────────────────────────────────

/**
 * Extract the first file-name-like segment (name.ext) from a tool's args string.
 * Used to render a FileTypeIcon + filename pill on file-operation steps. Returns
 * null when the args contain no recognizable filename (e.g. a bare shell command).
 */
function getFileName(args?: string): string | null {
  if (!args) return null;
  const match = args.match(/([^\s/\\]+\.[a-z0-9]+)(?:\s|$)/i);
  return match?.[1] ?? null;
}

/**
 * Return the icon component for a tool step based on its name.
 * Matches the Claude reference: file-type-specific icon for file ops,
 * semantic lucide glyphs for other tool types.
 */
type IconComponent = React.FC<{ className?: string }>;

function getToolIcon(toolName: string, filename?: string | null): IconComponent {
  // Connector/MCP tool call (mcp__<serverId>__<toolName>) — a consistent
  // "connector" glyph beats guessing from substrings in the tool name, which
  // can misfire (e.g. a GitHub "search_issues" tool matching the generic
  // 'search' bucket below and losing its connector identity).
  if (parseQualifiedMcpToolName(toolName)) return Plug;

  const n = toolName.toLowerCase();

  // File-type icon is handled separately in the step row when filename is present
  if (filename) return FileText; // placeholder; step renders FileTypeIcon directly

  if (n.includes('search') || n.includes('grep') || n.includes('find') || n.includes('ripgrep')) {
    return Search;
  }
  if (n.includes('web') || n.includes('fetch') || n.includes('http') || n.includes('url')) {
    return Globe;
  }
  if (n.includes('write') || n.includes('create')) {
    return FilePlus2;
  }
  if (n.includes('edit') || n.includes('patch') || n.includes('update')) {
    return FilePen;
  }
  if (
    n.includes('bash') ||
    n.includes('exec') ||
    n.includes('run') ||
    n.includes('command') ||
    n.includes('terminal') ||
    n.includes('script')
  ) {
    return SquareTerminal;
  }
  if (n.includes('list') || n.includes('ls') || n.includes('dir')) {
    return FolderOpen;
  }
  if (n.includes('skill') || n.includes('learn')) {
    // Claude reference (image 400 "Read design skill") uses an open-book glyph for skills.
    return BookOpen;
  }
  // Default: file-read / view
  return FileText;
}

// ─── Web-search tool detection + humanization ─────────────────────────────────

/** Known tool IDs that represent a web/perplexity search */
const WEB_SEARCH_TOOL_IDS = new Set([
  'web_search',
  'WebSearch',
  'search_web',
  'browser_search',
  'perplexity_search',
  'perplexity',
  'WebFetch',
  'fetch_url',
]);

/**
 * Returns true when this tool entry represents a web search call.
 * Used to decide whether to render inline source cards beneath the step.
 */
export function isWebSearchTool(name: string): boolean {
  if (WEB_SEARCH_TOOL_IDS.has(name)) return true;
  const n = name.toLowerCase();
  return (
    (n.includes('web') || n.includes('perplexity') || n.includes('brave') || n.includes('serp')) &&
    (n.includes('search') || n.includes('query') || n.includes('fetch'))
  );
}

/**
 * Map a raw tool id to a human-readable label.
 *
 * Rules (in priority order):
 *  1. If the tool is a web-search variant and `args` contains a recognizable
 *     query string (parameters.query or the raw args string), show that query.
 *  2. If the tool is a connector/MCP call (mcp__<serverId>__<toolName>), show
 *     "<Connector> · <tool>" so it carries its identity instead of the raw
 *     qualified wire name.
 *  3. Otherwise map known raw IDs to short English labels.
 *  4. Fall back to the original name (for human-named tools like "Read"/"Bash").
 */
export function humanizeToolName(
  name: string,
  args?: string,
  parameters?: Record<string, unknown>,
): string {
  // 1. Web-search: prefer showing the actual query
  if (isWebSearchTool(name)) {
    const query =
      (parameters?.['query'] as string | undefined) ||
      (parameters?.['q'] as string | undefined) ||
      args?.trim();
    if (query) return query;
    return 'Web search';
  }

  // 2. Connector/MCP tool call: render its connector identity
  const mcpTool = describeMcpTool(name);
  if (mcpTool) return mcpTool.label;

  // 3. Known raw snake_case → friendly label map
  const map: Record<string, string> = {
    web_search: 'Web search',
    search_web: 'Web search',
    browser_search: 'Web search',
    perplexity_search: 'Web search',
    file_read: 'Read file',
    file_write: 'Write file',
    file_edit: 'Edit file',
    file_create: 'Create file',
    file_delete: 'Delete file',
    shell_command: 'Run command',
    terminal_execute: 'Run command',
    terminal_run: 'Run command',
    bash_execute: 'Run command',
    code_execute: 'Run code',
    code_edit: 'Edit code',
    git_status: 'Git status',
    git_diff: 'Git diff',
    git_log: 'Git log',
    git_commit: 'Git commit',
    git_push: 'Git push',
    db_query: 'Database query',
    database_query: 'Database query',
    sql_query: 'SQL query',
    api_call: 'API call',
    http_request: 'HTTP request',
  };
  if (map[name]) return map[name]!;

  // 4. Return as-is (human-named tools: "Read", "Bash", "Write", etc.)
  return name;
}

// ─── Inline source cards (rendered inside the web-search step) ────────────────

interface InlineSourceCardsProps {
  sources: ResearchSource[];
  query?: string;
}

function InlineSourceCards({ sources, query: _query }: InlineSourceCardsProps) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-2 space-y-0.5">
      {/* Results container matching image-381: bordered rounded box, rows inside */}
      <div className="rounded-lg border border-border/40 bg-muted/10 overflow-hidden">
        <div className="divide-y divide-border/20 px-3">
          {sources.map((source, i) => (
            <InlineSourceRow key={`${source.url}-${i}`} source={source} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function InlineSourceRow({ source, index }: { source: ResearchSource; index: number }) {
  const [imgError, setImgError] = useState(false);

  // Derive a clean display hostname, handling Vertex AI redirect URIs gracefully
  let displayHost = source.url;
  try {
    const parsed = new URL(source.url);
    displayHost = parsed.hostname.replace(/^www\./, '');
  } catch {
    // keep raw
  }

  // Favicon: provided by source, else fall back to Google's favicon service
  const faviconSrc =
    source.favicon && !imgError
      ? source.favicon
      : (() => {
          try {
            const domain = new URL(source.url).hostname;
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
          } catch {
            return undefined;
          }
        })();

  return (
    <a
      href={/^https?:\/\//i.test(source.url || '') ? source.url : '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 py-1.5 min-w-0 hover:opacity-80 transition-opacity"
      aria-label={`Source ${source.citationIndex ?? index + 1}: ${source.title || displayHost}`}
    >
      {/* Favicon */}
      {faviconSrc ? (
        <img
          src={faviconSrc}
          alt=""
          className="h-3.5 w-3.5 shrink-0 rounded-sm"
          onError={() => setImgError(true)}
        />
      ) : (
        <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      {/* Title: takes remaining space, truncated */}
      <span className="flex-1 truncate text-xs text-foreground">{source.title || displayHost}</span>
      {/* Domain: right-aligned, muted */}
      <span className="shrink-0 text-[10px] text-muted-foreground/60 ml-2">{displayHost}</span>
      <ExternalLink
        className="h-2.5 w-2.5 shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground/50"
        aria-hidden="true"
      />
    </a>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolEntry {
  /** Unique identifier for this tool execution */
  id?: string;
  /** Display name of the tool (e.g. "Read", "Bash", "WebSearch") */
  name: string;
  status: 'running' | 'completed' | 'failed' | 'pending' | 'awaiting_approval';
  durationMs?: number;
  /** Set for a manual-approval card — the exact tool_call_id the resume must decide. */
  toolCallId?: string;
  /** When true, render approve/reject affordances (manual-approval gate). */
  requiresApproval?: boolean;
  /** Short arg preview shown in the card (e.g. file path or command) */
  args?: string;
  /** Optional parameters map forwarded to ToolCallCard */
  parameters?: Record<string, unknown>;
  /** When set, consecutive entries sharing the same key render as a parallel group */
  parallelGroup?: string;
  /** Optional error message when status === 'failed' */
  error?: string;
  /** Tool execution result content (stdout / response body), populated via x_tool_result SSE events */
  result?: string;
  /** Playful action phrase shown in the running-state header (e.g. "Running code"). */
  statusPhrase?: string;
}

interface ToolTimelineProps {
  tools: ToolEntry[];
  className?: string;
  /**
   * When true (default: auto when steps > 3) the timeline renders a single
   * collapsed summary line. Click expands to the full per-step view.
   * Pass `compact={false}` to always show the full timeline.
   */
  compact?: boolean;
  /**
   * Web search source cards to render INSIDE the web-search step (Claude reference).
   * Collected from message.metadata.searchResults / citations by MessageBubble.
   */
  searchSources?: ResearchSource[];
  /** The search query string corresponding to searchSources. */
  searchQuery?: string;
  /**
   * Manual-approval callbacks. When provided, awaiting_approval cards render
   * approve/reject buttons; the argument is the tool_call_id being decided.
   */
  onApprove?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;
  /**
   * True when this message's suspended turn is no longer in the live
   * approval registry and cannot be rebuilt from its persisted run reference.
   * Awaiting-approval cards render an expired notice instead of live buttons,
   * which would otherwise silently no-op. See MessageBubble's
   * `isApprovalTurnLive` check.
   */
  expired?: boolean;
  /** Resend affordance shown on an expired approval card. */
  onResend?: (toolCallId: string) => void;
}

interface EntryGroup {
  parallelGroup?: string;
  entries: ToolEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stableId(tool: ToolEntry, index: number): string {
  if (tool.id) return tool.id;
  return `tool-${index}-${tool.name}`;
}

function toToolCallStatus(status: ToolEntry['status']): ToolCallStatus {
  switch (status) {
    case 'running':
      return 'running';
    case 'completed':
      return 'complete';
    case 'failed':
      return 'error';
    case 'awaiting_approval':
      return 'awaiting_approval';
    default:
      return 'pending';
  }
}

/** Build a minimal parameters record from args string, if present. */
function buildParameters(
  args?: string,
  parameters?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (parameters && Object.keys(parameters).length > 0) return parameters;
  if (args) return { input: args };
  return undefined;
}

function groupTools(tools: ToolEntry[]): EntryGroup[] {
  const groups: EntryGroup[] = [];
  let current: EntryGroup | null = null;

  for (const tool of tools) {
    if (tool.parallelGroup && current?.parallelGroup === tool.parallelGroup) {
      current.entries.push(tool);
    } else {
      current = { parallelGroup: tool.parallelGroup, entries: [tool] };
      groups.push(current);
    }
  }

  return groups;
}

/**
 * Build a compact action-phrased summary from a list of tool entries.
 * Uses Claude-style counted verb phrases: "Ran 5 commands, created a file, read a file".
 * Never emits a mechanical "N tools" count.
 */
function buildCompactSummary(tools: ToolEntry[]): string {
  type Bucket =
    | 'connector'
    | 'shell'
    | 'file-read'
    | 'file-write'
    | 'file-edit'
    | 'web-search'
    | 'web-fetch'
    | 'codebase-search'
    | 'list';

  // Connector identity for the compact phrase (claude.ai parity: "Used GitHub
  // integration", not "ran a command"). Collected up front because the
  // per-bucket phrase builder only sees counts.
  const connectorNames = new Set<string>();
  for (const tool of tools) {
    const described = describeMcpTool(tool.name);
    if (described) connectorNames.add(described.label.split(' · ')[0] ?? described.serverId);
  }

  function categorize(name: string): Bucket {
    // Qualified connector calls first — their tool names (post_issue_comment,
    // get_pull_request_diff, ...) would false-positive into the substring
    // heuristics below.
    if (parseQualifiedMcpToolName(name)) return 'connector';
    const n = name.toLowerCase();
    if (
      n.includes('bash') ||
      n.includes('exec') ||
      n.includes('run') ||
      n.includes('command') ||
      n.includes('terminal') ||
      n.includes('script')
    )
      return 'shell';
    if (n.includes('create') || n.includes('write') || n.includes('new')) return 'file-write';
    if (n.includes('edit') || n.includes('patch') || n.includes('update')) return 'file-edit';
    if (
      n.includes('read') ||
      n.includes('view') ||
      n.includes('cat') ||
      n.includes('open') ||
      n.includes('show')
    )
      return 'file-read';
    if (
      (n.includes('web') || n.includes('perplexity')) &&
      (n.includes('search') || n.includes('query'))
    )
      return 'web-search';
    if (n.includes('fetch') || n.includes('http') || n.includes('url') || n.includes('web'))
      return 'web-fetch';
    if (n.includes('search') || n.includes('grep') || n.includes('find') || n.includes('ripgrep'))
      return 'codebase-search';
    if (n.includes('list') || n.includes('ls') || n.includes('dir')) return 'list';
    return 'shell';
  }

  // Count occurrences per bucket in order of first appearance
  const counts = new Map<Bucket, number>();
  const order: Bucket[] = [];

  for (const tool of tools) {
    const b = categorize(tool.name);
    if (!counts.has(b)) {
      counts.set(b, 0);
      order.push(b);
    }
    counts.set(b, counts.get(b)! + 1);
  }

  // Phrase builder: count-aware singular/plural
  function phrase(bucket: Bucket, count: number): string {
    const n = count;
    switch (bucket) {
      case 'connector': {
        if (connectorNames.size === 1) {
          const only = [...connectorNames][0]!;
          return n === 1
            ? `used the ${only} integration`
            : `used the ${only} integration ${n} times`;
        }
        return `used ${connectorNames.size} integrations`;
      }
      case 'shell':
        return n === 1 ? 'ran a command' : `ran ${n} commands`;
      case 'file-write':
        return n === 1 ? 'created a file' : `created ${n} files`;
      case 'file-edit':
        return n === 1 ? 'edited a file' : `edited ${n} files`;
      case 'file-read':
        return n === 1 ? 'read a file' : `read ${n} files`;
      case 'web-search':
        return n === 1 ? 'searched the web' : 'searched the web';
      case 'web-fetch':
        return n === 1 ? 'fetched a page' : `fetched ${n} pages`;
      case 'codebase-search':
        return n === 1 ? 'searched the codebase' : 'searched the codebase';
      case 'list':
        return n === 1 ? 'listed a directory' : `listed ${n} directories`;
    }
  }

  if (order.length === 0) return 'Used tools';

  const phrases = order.map((b) => phrase(b, counts.get(b)!));

  // Capitalize only the first phrase
  const [first, ...rest] = phrases;
  const capitalized = (first ?? '').charAt(0).toUpperCase() + (first ?? '').slice(1);

  if (rest.length === 0) return capitalized;
  if (rest.length === 1) return `${capitalized}, ${rest[0]}`;
  const last = rest.pop()!;
  return `${capitalized}, ${rest.join(', ')}, ${last}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

// Threshold: auto-compact when more than this many steps
const COMPACT_THRESHOLD = 3;

/**
 * A single timeline step row: tool icon + label + optional filename chip below.
 * Matches the Claude reference layout in image 385.
 *
 * When `searchSources` is provided and this step is a web-search tool, the
 * source cards render INSIDE this row (directly below the label), matching
 * the Claude reference (image 381).
 */
function TimelineStepRow({
  tool,
  toolCall,
  showParameters,
  searchSources,
  searchQuery,
  onApprove,
  onReject,
  expired,
  onResend,
}: {
  tool: ToolEntry;
  toolCall: ToolCall;
  showParameters: boolean;
  searchSources?: ResearchSource[];
  searchQuery?: string;
  onApprove?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;
  expired?: boolean;
  onResend?: (toolCallId: string) => void;
}) {
  // A connector/MCP call's args (owner/repo/issue_number, etc.) can
  // incidentally look like a filename to getFileName — check this first so a
  // connector step always gets its Plug icon + connector label, never a
  // misfired FileTypeIcon.
  const mcpTool = parseQualifiedMcpToolName(tool.name);
  const filename = mcpTool ? null : getFileName(tool.args);
  const hasFile = filename != null;
  const StepIcon = hasFile ? null : getToolIcon(tool.name, null);
  const isWebSearch = isWebSearchTool(tool.name);
  const hasSources = isWebSearch && searchSources && searchSources.length > 0;

  // Build the humanized label for this tool call
  const humanLabel = humanizeToolName(tool.name, tool.args, tool.parameters);
  const displayToolCall: ToolCall = { ...toolCall, name: humanLabel };
  // A quick-pick preference for a dead turn would silently no-op exactly
  // like live Approve/Reject buttons would -- hide it too when expired.
  const showPermissionPicker = mcpTool != null && tool.status === 'awaiting_approval' && !expired;

  return (
    <div className="flex flex-col gap-0.5">
      {/* Row: icon + label */}
      <div className="flex items-start gap-2.5">
        {/* Icon column */}
        <div className="mt-0.5 shrink-0">
          {hasFile ? (
            <FileTypeIcon filename={filename} className="h-4 w-4 text-muted-foreground" />
          ) : StepIcon ? (
            <StepIcon className="h-4 w-4 text-muted-foreground" />
          ) : null}
        </div>
        {/* Tool call card (label + expand). Web-search steps have no request/
            response payload and surface their result as source cards below, so
            we render a plain label instead of the ToolCallCard's (empty) expand
            box to avoid a hollow container under "Web search". */}
        <div className="flex-1 min-w-0">
          {isWebSearch ? (
            <span className="text-sm text-foreground">{humanLabel}</span>
          ) : (
            <ToolCallCard
              toolCall={displayToolCall}
              showParameters={showParameters}
              onApprove={onApprove}
              onReject={onReject}
              expired={expired}
              onResend={onResend}
            />
          )}
        </div>
      </div>
      {/* Filename chip: BELOW the label row, indented to align with the label text */}
      {hasFile && (
        <div className="pl-7">
          <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 max-w-full">
            <span className="truncate font-mono text-[10px] text-muted-foreground">{filename}</span>
          </span>
        </div>
      )}
      {/* Inline source cards: rendered INSIDE the web-search step (Claude reference image 381) */}
      {hasSources && (
        <div className="pl-7 mt-1">
          <InlineSourceCards sources={searchSources!} query={searchQuery} />
        </div>
      )}
      {/* Per-tool permission quick-pick: only for a connector call awaiting
          approval (Claude parity — allow/ask/block with a persisted decision). */}
      {showPermissionPicker && mcpTool && (
        <div className="pl-7 mt-1">
          <ToolPermissionQuickPicker
            serverId={mcpTool.serverId}
            toolName={mcpTool.toolName}
            toolCallId={tool.toolCallId}
            onApprove={onApprove}
            onReject={onReject}
          />
        </div>
      )}
    </div>
  );
}

// ─── Tool permission quick-picker ──────────────────────────────────────────────

/**
 * Compact allow/ask/block picker rendered under a connector tool call that is
 * awaiting approval. Persists the decision to the same per-(connectorId,
 * toolName) store useChatStream consults to auto-resolve future calls
 * (see tool-permissions-store.ts); picking Always allow / Block also resolves
 * THIS pending call immediately via the same onApprove/onReject callbacks the
 * card's own buttons use, so the user isn't left clicking twice.
 */
const PERMISSION_QUICK_PICKS: { level: PermissionLevel; label: string; icon: IconComponent }[] = [
  { level: 'allow', label: 'Always allow', icon: Check },
  { level: 'ask', label: 'Ask', icon: HelpCircle },
  { level: 'deny', label: 'Block', icon: Ban },
];

function ToolPermissionQuickPicker({
  serverId,
  toolName,
  toolCallId,
  onApprove,
  onReject,
}: {
  serverId: string;
  toolName: string;
  toolCallId?: string;
  onApprove?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;
}) {
  const setToolPermission = useToolPermissionsStore((s) => s.setToolPermission);
  const current = useToolPermissionsStore((s) => s.getToolPermission(serverId, toolName));

  const handlePick = (level: PermissionLevel) => {
    setToolPermission(serverId, toolName, level);
    if (!toolCallId) return;
    if (level === 'allow') onApprove?.(toolCallId);
    if (level === 'deny') onReject?.(toolCallId);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="group"
      aria-label={`Remember permission for ${toolName}`}
    >
      <span className="text-[10px] text-muted-foreground">Remember:</span>
      {PERMISSION_QUICK_PICKS.map(({ level, label, icon: Icon }) => (
        <button
          key={level}
          type="button"
          onClick={() => handlePick(level)}
          aria-pressed={current === level}
          title={label}
          className={cn(
            'flex h-6 items-center gap-1 rounded-md border px-1.5 text-[10px] font-medium transition-colors',
            current === level
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border/40 text-muted-foreground hover:border-border/70 hover:text-foreground',
          )}
        >
          <Icon className="h-2.5 w-2.5" aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function ToolTimeline({
  tools,
  className,
  compact: compactProp,
  searchSources,
  searchQuery,
  onApprove,
  onReject,
  expired,
  onResend,
}: ToolTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [userForcedClosed, setUserForcedClosed] = useState(false);
  // Compact expanded state · separate from the regular isExpanded
  const [compactExpanded, setCompactExpanded] = useState(false);

  const hasRunning = useMemo(() => tools.some((t) => t.status === 'running'), [tools]);
  // A tool awaiting approval must keep the timeline OPEN so the approve/reject
  // buttons are visible (they live inside the expandable list).
  const hasAwaiting = useMemo(() => tools.some((t) => t.status === 'awaiting_approval'), [tools]);
  const errorCount = useMemo(() => tools.filter((t) => t.status === 'failed').length, [tools]);

  // Compact mode: explicit prop OR auto when step count > threshold (and neither
  // running nor awaiting approval).
  const isCompact =
    compactProp !== undefined
      ? compactProp
      : !hasRunning && !hasAwaiting && tools.length > COMPACT_THRESHOLD;

  // Reset userForcedClosed when all running tools finish so next batch auto-expands
  const prevHasRunning = useRef(hasRunning);
  useEffect(() => {
    if (prevHasRunning.current && !hasRunning) {
      setUserForcedClosed(false);
    }
    prevHasRunning.current = hasRunning;
  }, [hasRunning]);

  // Auto-expand while tools are running or awaiting approval, but respect the
  // user's manual close.
  const isOpen = userForcedClosed ? false : hasRunning || hasAwaiting || isExpanded;

  const groups = useMemo(() => groupTools(tools), [tools]);
  const summary = useMemo(() => buildCompactSummary(tools), [tools]);

  // Pick the status phrase from the most recently started running tool, if set.
  // Falls back to "Working..." so the header is always informative.
  const runningPhrase = useMemo(() => {
    const running = [...tools].reverse().find((t) => t.status === 'running');
    return running?.statusPhrase ?? 'Working...';
  }, [tools]);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      // User is collapsing · if tools are running, force closed
      setUserForcedClosed(true);
      setIsExpanded(false);
    } else {
      // User is expanding · clear forced close
      setUserForcedClosed(false);
      setIsExpanded(true);
    }
  }, [isOpen]);

  if (tools.length === 0) return null;

  // ── Compact render ────────────────────────────────────────────────────────
  // Compact = collapsed single-line summary with right-pointing chevron.
  // No Wrench icon, no "N tools" count, no duration.
  if (isCompact && !compactExpanded) {
    return (
      <div className={cn('flex items-center', className)}>
        <button
          type="button"
          onClick={() => setCompactExpanded(true)}
          className="flex items-center gap-1.5 rounded-md py-0.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Expand tool details"
        >
          <span>{summary}</span>
          {errorCount > 0 && <span className="text-rose-400 text-xs">{errorCount} failed</span>}
          <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        </button>
      </div>
    );
  }

  // ── Full / expanded render ────────────────────────────────────────────────
  // Header: action-phrased summary + right-aligned chevron.
  // No Wrench icon. Chevron is right-pointing when closed, down when open.
  return (
    <div className={cn('', className)}>
      {/* Compact collapse button · shown when user has expanded from compact mode */}
      {isCompact && compactExpanded && (
        <div className="mb-1">
          {/* Header row handled below — the collapse affordance is just clicking the header */}
        </div>
      )}

      {/* Header · always visible */}
      <button
        type="button"
        onClick={isCompact ? () => setCompactExpanded(false) : handleToggle}
        aria-expanded={isCompact ? true : isOpen}
        aria-label="Toggle tool timeline"
        className="w-full flex items-center gap-2 py-0.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex-1 text-left">
          {hasRunning ? (
            <span className="text-primary">{runningPhrase}</span>
          ) : (
            <>
              {summary}
              {errorCount > 0 && (
                <span className="text-rose-400 ml-1.5 text-xs">{errorCount} failed</span>
              )}
            </>
          )}
        </span>
        {/* Chevron at the right end of the header line */}
        <motion.span
          animate={{ rotate: isOpen || (isCompact && compactExpanded) ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </motion.span>
      </button>

      {/* Expandable tool list with framer-motion height + opacity animation */}
      <AnimatePresence initial={false}>
        {(isOpen || (isCompact && compactExpanded)) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.2, ease: 'easeInOut' },
              opacity: { duration: 0.15 },
            }}
            className="overflow-hidden"
          >
            {/* Vertical timeline: thin connector line runs along the left edge of icons */}
            <div className="relative mt-2 pl-2">
              {/* Vertical connector line */}
              <div
                className="absolute left-4 top-2 bottom-6 w-px bg-border/40"
                aria-hidden="true"
              />
              <div className="space-y-3">
                {(() => {
                  // Track whether we've attached the search sources to a step yet.
                  // Sources render only on the FIRST web-search step to avoid duplication.
                  let sourcesAttached = false;

                  return groups.map((group, gi) => {
                    const isParallel = group.parallelGroup != null && group.entries.length > 1;

                    if (isParallel) {
                      return (
                        <div
                          key={group.parallelGroup ?? gi}
                          className="border-l-2 border-blue-500/30 pl-2 py-0.5 space-y-3 ml-2"
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            <GitBranch className="w-2.5 h-2.5 text-blue-400/70 shrink-0" />
                            <span className="text-[10px] text-blue-400/70 font-mono">parallel</span>
                          </div>
                          {group.entries.map((tool, ti) => {
                            const id = stableId(tool, gi * 100 + ti);
                            const toolCall: ToolCall = {
                              id,
                              name: tool.name,
                              status: toToolCallStatus(tool.status),
                              durationMs: tool.durationMs,
                              parameters: buildParameters(tool.args, tool.parameters),
                              result: tool.result,
                              error: tool.error,
                            };
                            const attachSources =
                              !sourcesAttached &&
                              isWebSearchTool(tool.name) &&
                              searchSources &&
                              searchSources.length > 0;
                            if (attachSources) sourcesAttached = true;
                            return (
                              <TimelineStepRow
                                key={id}
                                tool={tool}
                                toolCall={toolCall}
                                showParameters={Boolean(tool.args ?? tool.parameters)}
                                searchSources={attachSources ? searchSources : undefined}
                                searchQuery={attachSources ? searchQuery : undefined}
                                onApprove={onApprove}
                                onReject={onReject}
                                expired={expired}
                                onResend={onResend}
                              />
                            );
                          })}
                        </div>
                      );
                    }

                    return group.entries.map((tool, ti) => {
                      const id = stableId(tool, gi * 100 + ti);
                      const toolCall: ToolCall = {
                        // Approval cards carry the tool_call_id as the card id so
                        // onApprove/onReject can address the exact pending call.
                        id: tool.toolCallId ?? id,
                        name: tool.name,
                        status: toToolCallStatus(tool.status),
                        durationMs: tool.durationMs,
                        parameters: buildParameters(tool.args, tool.parameters),
                        result: tool.result,
                        error: tool.error,
                        requiresApproval: tool.requiresApproval,
                      };
                      const attachSources =
                        !sourcesAttached &&
                        isWebSearchTool(tool.name) &&
                        searchSources &&
                        searchSources.length > 0;
                      if (attachSources) sourcesAttached = true;
                      return (
                        <TimelineStepRow
                          key={id}
                          tool={tool}
                          toolCall={toolCall}
                          showParameters={Boolean(tool.args ?? tool.parameters)}
                          searchSources={attachSources ? searchSources : undefined}
                          searchQuery={attachSources ? searchQuery : undefined}
                          onApprove={onApprove}
                          onReject={onReject}
                          expired={expired}
                          onResend={onResend}
                        />
                      );
                    });
                  });
                })()}

                {/* Done row: neutral outline circle-check (not green) + "Done" in normal foreground */}
                {!hasRunning && errorCount === 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <CircleCheck
                      className="w-4 h-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="text-sm text-foreground">Done</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Memoize with custom comparison to prevent unnecessary re-renders
const MemoizedToolTimeline = memo(ToolTimeline, (prev, next) => {
  if (prev.className !== next.className) return false;
  if (prev.compact !== next.compact) return false;
  if (prev.searchQuery !== next.searchQuery) return false;
  if ((prev.searchSources?.length ?? 0) !== (next.searchSources?.length ?? 0)) return false;
  // Approval callbacks are stable useCallback refs; a change means a different
  // wiring and must re-render so the buttons dispatch to the new handler.
  if (prev.onApprove !== next.onApprove || prev.onReject !== next.onReject) return false;
  if (prev.expired !== next.expired || prev.onResend !== next.onResend) return false;
  if (prev.tools.length !== next.tools.length) return false;

  for (let i = 0; i < prev.tools.length; i++) {
    const p = prev.tools[i];
    const n = next.tools[i];
    if (
      !p ||
      !n ||
      p.name !== n.name ||
      p.status !== n.status ||
      p.durationMs !== n.durationMs ||
      p.args !== n.args ||
      p.parallelGroup !== n.parallelGroup ||
      p.error !== n.error ||
      p.result !== n.result ||
      p.requiresApproval !== n.requiresApproval ||
      p.toolCallId !== n.toolCallId
    ) {
      return false;
    }
  }

  return true;
});

MemoizedToolTimeline.displayName = 'ToolTimeline';

export { MemoizedToolTimeline as ToolTimeline };
