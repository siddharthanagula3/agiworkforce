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
  Sparkles,
  Search,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { ToolCallCard, type ToolCall, type ToolCallStatus } from '../ToolCallCard';
import { FileTypeIcon } from './FileTypeIcon';

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
    return Sparkles;
  }
  // Default: file-read / view
  return FileText;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolEntry {
  /** Unique identifier for this tool execution */
  id?: string;
  /** Display name of the tool (e.g. "Read", "Bash", "WebSearch") */
  name: string;
  status: 'running' | 'completed' | 'failed' | 'pending';
  durationMs?: number;
  /** Short arg preview shown in the card (e.g. file path or command) */
  args?: string;
  /** Optional parameters map forwarded to ToolCallCard */
  parameters?: Record<string, unknown>;
  /** When set, consecutive entries sharing the same key render as a parallel group */
  parallelGroup?: string;
  /** Optional error message when status === 'failed' */
  error?: string;
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
    | 'shell'
    | 'file-read'
    | 'file-write'
    | 'file-edit'
    | 'web-search'
    | 'web-fetch'
    | 'codebase-search'
    | 'list';

  function categorize(name: string): Bucket {
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
 */
function TimelineStepRow({
  tool,
  toolCall,
  showParameters,
}: {
  tool: ToolEntry;
  toolCall: ToolCall;
  showParameters: boolean;
}) {
  const filename = getFileName(tool.args);
  const hasFile = filename != null;
  const StepIcon = hasFile ? null : getToolIcon(tool.name, null);

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
        {/* Tool call card (label + expand) */}
        <div className="flex-1 min-w-0">
          <ToolCallCard toolCall={toolCall} showParameters={showParameters} />
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
    </div>
  );
}

function ToolTimeline({ tools, className, compact: compactProp }: ToolTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [userForcedClosed, setUserForcedClosed] = useState(false);
  // Compact expanded state · separate from the regular isExpanded
  const [compactExpanded, setCompactExpanded] = useState(false);

  const hasRunning = useMemo(() => tools.some((t) => t.status === 'running'), [tools]);
  const errorCount = useMemo(() => tools.filter((t) => t.status === 'failed').length, [tools]);

  // Compact mode: explicit prop OR auto when step count > threshold (and not running)
  const isCompact =
    compactProp !== undefined ? compactProp : !hasRunning && tools.length > COMPACT_THRESHOLD;

  // Reset userForcedClosed when all running tools finish so next batch auto-expands
  const prevHasRunning = useRef(hasRunning);
  useEffect(() => {
    if (prevHasRunning.current && !hasRunning) {
      setUserForcedClosed(false);
    }
    prevHasRunning.current = hasRunning;
  }, [hasRunning]);

  // Auto-expand while tools are running, but respect the user's manual close
  const isOpen = userForcedClosed ? false : hasRunning || isExpanded;

  const groups = useMemo(() => groupTools(tools), [tools]);
  const summary = useMemo(() => buildCompactSummary(tools), [tools]);

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
            <span className="text-primary">Running tools...</span>
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
                {groups.map((group, gi) => {
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
                          };
                          return (
                            <TimelineStepRow
                              key={id}
                              tool={tool}
                              toolCall={toolCall}
                              showParameters={Boolean(tool.args ?? tool.parameters)}
                            />
                          );
                        })}
                      </div>
                    );
                  }

                  return group.entries.map((tool, ti) => {
                    const id = stableId(tool, gi * 100 + ti);
                    const toolCall: ToolCall = {
                      id,
                      name: tool.name,
                      status: toToolCallStatus(tool.status),
                      durationMs: tool.durationMs,
                      parameters: buildParameters(tool.args, tool.parameters),
                    };
                    return (
                      <TimelineStepRow
                        key={id}
                        tool={tool}
                        toolCall={toolCall}
                        showParameters={Boolean(tool.args ?? tool.parameters)}
                      />
                    );
                  });
                })}

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
      p.error !== n.error
    ) {
      return false;
    }
  }

  return true;
});

MemoizedToolTimeline.displayName = 'ToolTimeline';

export { MemoizedToolTimeline as ToolTimeline };
