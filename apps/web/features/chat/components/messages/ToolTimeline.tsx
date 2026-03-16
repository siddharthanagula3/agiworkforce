'use client';

import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, GitBranch, Wrench } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { ToolCallCard, type ToolCall, type ToolCallStatus } from '../ToolCallCard';

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

// ─── Component ────────────────────────────────────────────────────────────────

function ToolTimeline({ tools, className }: ToolTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [userForcedClosed, setUserForcedClosed] = useState(false);

  const hasRunning = useMemo(() => tools.some((t) => t.status === 'running'), [tools]);
  const errorCount = useMemo(() => tools.filter((t) => t.status === 'failed').length, [tools]);

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
      // User is collapsing — if tools are running, force closed
      setUserForcedClosed(true);
      setIsExpanded(false);
    } else {
      // User is expanding — clear forced close
      setUserForcedClosed(false);
      setIsExpanded(true);
    }
  }, [isOpen]);

  if (tools.length === 0) return null;

  return (
    <div className={cn('border border-border/30 rounded-lg overflow-hidden', className)}>
      {/* Header — always visible */}
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
            <span className="text-violet-400">Running tools...</span>
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
            <div className="px-3 pb-3 pt-2 space-y-1.5 border-t border-border/20">
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
                        return (
                          <ToolCallCard
                            key={id}
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
                    <ToolCallCard
                      key={id}
                      toolCall={toolCall}
                      showParameters={Boolean(tool.args ?? tool.parameters)}
                    />
                  );
                });
              })}
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
