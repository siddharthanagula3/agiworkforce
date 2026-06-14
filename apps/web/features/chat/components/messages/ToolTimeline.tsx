'use client';

import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, CircleCheck, GitBranch, Wrench } from 'lucide-react';
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

/** Shared file-name pill: FileTypeIcon + truncated filename (Claude-style). */
function FileBadge({ filename }: { filename: string }) {
  return (
    <span className="absolute right-0 top-0.5 z-10 inline-flex max-w-[55%] items-center gap-1 rounded-md bg-muted/70 px-1.5 py-px">
      <FileTypeIcon filename={filename} className="h-3 w-3" />
      <span className="truncate font-mono text-[10px] text-muted-foreground">{filename}</span>
    </span>
  );
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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Build a compact semantic summary from a list of tool entries.
 * Returns a human-readable description of what was accomplished, not a
 * mechanical count. For example: "Read and analyzed files", "Searched the
 * codebase", "Ran shell commands and edited code".
 */
function buildCompactSummary(tools: ToolEntry[]): string {
  // Bucket each tool into a semantic category
  type Bucket =
    | 'shell'
    | 'file-read'
    | 'file-write'
    | 'web-search'
    | 'web-fetch'
    | 'codebase-search'
    | 'list';

  function categorize(name: string): Bucket {
    const n = name.toLowerCase();
    if (n.includes('bash') || n.includes('exec') || n.includes('run') || n.includes('command')) {
      return 'shell';
    }
    if (n.includes('write') || n.includes('create') || n.includes('edit') || n.includes('patch')) {
      return 'file-write';
    }
    if (n.includes('read') || n.includes('view') || n.includes('cat') || n.includes('open')) {
      return 'file-read';
    }
    if (n.includes('web') && (n.includes('search') || n.includes('query'))) {
      return 'web-search';
    }
    if (n.includes('fetch') || n.includes('http') || n.includes('url') || n.includes('web')) {
      return 'web-fetch';
    }
    if (n.includes('search') || n.includes('grep') || n.includes('find') || n.includes('ripgrep')) {
      return 'codebase-search';
    }
    if (n.includes('list') || n.includes('ls') || n.includes('dir')) {
      return 'list';
    }
    return 'shell';
  }

  // Collect unique categories in order of first appearance
  const seen = new Set<Bucket>();
  for (const tool of tools) {
    seen.add(categorize(tool.name));
  }
  const categories = [...seen];

  // Semantic label per bucket (no counts)
  const semanticLabel: Record<Bucket, string> = {
    'file-read': 'Read and analyzed files',
    'file-write': 'Edited code',
    shell: 'Ran shell commands',
    'web-search': 'Searched the web',
    'web-fetch': 'Fetched web content',
    'codebase-search': 'Searched the codebase',
    list: 'Listed directory contents',
  };

  if (categories.length === 0) return 'Used tools';

  // Combine multiple semantic labels with commas + "and"
  const labels = categories.map((c) => semanticLabel[c]);
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  const last = labels.pop()!;
  return `${labels.join(', ')}, and ${last}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

// Threshold: auto-compact when more than this many steps
const COMPACT_THRESHOLD = 3;

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

  const totalDuration = useMemo(
    () => tools.reduce((sum, t) => sum + (t.durationMs ?? 0), 0),
    [tools],
  );

  const groups = useMemo(() => groupTools(tools), [tools]);

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
  if (isCompact && !compactExpanded) {
    const summary = buildCompactSummary(tools);
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <button
          type="button"
          onClick={() => setCompactExpanded(true)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
          aria-label="Expand tool details"
        >
          <Wrench className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span className="capitalize">{summary}</span>
          {totalDuration > 0 && (
            <span className="text-muted-foreground/60">· {formatDuration(totalDuration)}</span>
          )}
          {errorCount > 0 && <span className="text-rose-400">· {errorCount} failed</span>}
          <ChevronDown className="w-3 h-3 shrink-0 -rotate-90" aria-hidden="true" />
        </button>
      </div>
    );
  }

  // ── Full / expanded render ────────────────────────────────────────────────
  return (
    <div className={cn('border border-border/30 rounded-lg overflow-hidden', className)}>
      {/* Compact collapse button · shown when user has expanded from compact mode */}
      {isCompact && compactExpanded && (
        <button
          type="button"
          onClick={() => setCompactExpanded(false)}
          className="w-full flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground hover:bg-muted/30 transition-colors border-b border-border/20"
          aria-label="Collapse tool details"
        >
          <ChevronDown className="w-3 h-3 shrink-0 rotate-180" aria-hidden="true" />
          <span>Collapse</span>
        </button>
      )}
      {/* Header · always visible */}
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-label="Toggle tool timeline"
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <ChevronDown className="w-3 h-3" />
        </motion.span>
        <Wrench className="w-3 h-3 shrink-0" />
        <span>
          {hasRunning ? (
            <span className="text-primary">Running tools...</span>
          ) : (
            <>
              {tools.length} tool{tools.length !== 1 ? 's' : ''}
              {totalDuration > 0 && (
                <span className="text-muted-foreground/60 ml-1">
                  · {formatDuration(totalDuration)} total
                </span>
              )}
              {errorCount > 0 && <span className="text-rose-400 ml-1">· {errorCount} failed</span>}
            </>
          )}
        </span>
      </button>

      {/* Expandable tool list with framer-motion height + opacity animation */}
      <AnimatePresence initial={false}>
        {isOpen && (
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
            {/* Vertical connector line wraps all sequential steps */}
            <div className="border-t border-border/20">
              <div className="relative ml-4 border-l border-border/30 pl-3 pb-3 pt-2 space-y-1.5">
                {groups.map((group, gi) => {
                  const isParallel = group.parallelGroup != null && group.entries.length > 1;

                  if (isParallel) {
                    return (
                      <div
                        key={group.parallelGroup ?? gi}
                        className="border-l-2 border-blue-500/30 pl-2 py-0.5 space-y-1.5 mx-0"
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
                          const fileName = getFileName(tool.args);
                          return (
                            <div key={id} className="relative">
                              {fileName && <FileBadge filename={fileName} />}
                              <ToolCallCard
                                toolCall={toolCall}
                                showParameters={Boolean(tool.args ?? tool.parameters)}
                              />
                            </div>
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
                    const fileName = getFileName(tool.args);
                    return (
                      <div key={id} className="relative">
                        {fileName && <FileBadge filename={fileName} />}
                        <ToolCallCard
                          toolCall={toolCall}
                          showParameters={Boolean(tool.args ?? tool.parameters)}
                        />
                      </div>
                    );
                  });
                })}

                {/* Done row · shown when every tool completed without error */}
                {!hasRunning && errorCount === 0 && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <CircleCheck
                      className="w-3.5 h-3.5 shrink-0 text-emerald-500"
                      aria-hidden="true"
                    />
                    <span className="text-xs text-emerald-500 font-medium">Done</span>
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
