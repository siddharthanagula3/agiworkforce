'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  FileText,
  Terminal,
  Globe,
  Search,
  Database,
  Wrench,
  GitBranch,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';

interface ToolEntry {
  name: string;
  status: 'running' | 'completed' | 'failed';
  durationMs?: number;
  args?: string;
  /** When set, consecutive entries sharing the same key render as a parallel group */
  parallelGroup?: string;
}

interface ToolTimelineProps {
  tools: ToolEntry[];
  className?: string;
}

interface EntryGroup {
  parallelGroup?: string;
  entries: ToolEntry[];
}

function getToolIcon(name: string): React.ElementType {
  const lower = name.toLowerCase();
  if (
    lower.includes('read') ||
    lower.includes('write') ||
    lower.includes('edit') ||
    lower.includes('file')
  ) {
    return FileText;
  }
  if (
    lower.includes('bash') ||
    lower.includes('terminal') ||
    lower.includes('shell') ||
    lower.includes('exec')
  ) {
    return Terminal;
  }
  if (
    lower.includes('web') ||
    lower.includes('fetch') ||
    lower.includes('browse') ||
    lower.includes('http')
  ) {
    return Globe;
  }
  if (lower.includes('search')) {
    return Search;
  }
  if (lower.includes('memory') || lower.includes('database') || lower.includes('db')) {
    return Database;
  }
  return Wrench;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
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

function ToolItem({ tool }: { tool: ToolEntry }) {
  const Icon = getToolIcon(tool.name);
  const isRunning = tool.status === 'running';
  const isFailed = tool.status === 'failed';

  return (
    <div className="flex items-center gap-2 text-xs py-0.5 px-3 font-mono">
      {/* Status indicator */}
      {isRunning ? (
        <Loader2 className="w-3 h-3 shrink-0 text-violet-400 animate-spin" />
      ) : isFailed ? (
        <X className="w-3 h-3 shrink-0 text-rose-400" />
      ) : (
        <Check className="w-3 h-3 shrink-0 text-emerald-400" />
      )}

      {/* Tool icon */}
      {}
      <Icon
        className={cn(
          'w-3 h-3 shrink-0',
          isRunning ? 'text-violet-400' : isFailed ? 'text-rose-400' : 'text-emerald-400',
        )}
      />

      {/* Tool label: Name(args) */}
      <span className="truncate max-w-[280px]">
        <span className={cn(isFailed ? 'text-rose-400' : 'text-foreground/80')}>{tool.name}</span>
        {tool.args && <span className="text-muted-foreground/70">({tool.args})</span>}
        {isRunning && <span className="text-violet-400">...</span>}
      </span>

      {/* Duration */}
      {!isRunning && tool.durationMs != null && (
        <span className="ml-auto shrink-0 text-muted-foreground/50">
          {formatDuration(tool.durationMs)}
        </span>
      )}
    </div>
  );
}

export function ToolTimeline({ tools, className }: ToolTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasRunning = tools.some((t) => t.status === 'running');
  const errorCount = tools.filter((t) => t.status === 'failed').length;

  // Auto-expand while tools are running; preserve manual expansion state
  const isOpen = hasRunning || isExpanded;

  const totalDuration = tools.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
  const groups = groupTools(tools);

  if (tools.length === 0) return null;

  return (
    <div className={cn('border border-border/30 rounded-lg overflow-hidden', className)}>
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded((p) => !p)}
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

      {/* Expandable tool list — framer-motion animation matching desktop */}
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
            <div className="pb-2 space-y-0.5 border-t border-border/20">
              {groups.map((group, gi) => {
                const isParallel = group.parallelGroup != null && group.entries.length > 1;

                if (isParallel) {
                  return (
                    <div
                      key={group.parallelGroup ?? gi}
                      className="border-l-2 border-blue-500/30 pl-2 py-0.5 space-y-0.5 mx-3"
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        <GitBranch className="w-2.5 h-2.5 text-blue-400/70 shrink-0" />
                        <span className="text-[10px] text-blue-400/70 font-mono">parallel</span>
                      </div>
                      {group.entries.map((tool, ti) => (
                        <ToolItem key={`${tool.name}-${ti}`} tool={tool} />
                      ))}
                    </div>
                  );
                }

                return group.entries.map((tool, ti) => (
                  <ToolItem key={`${tool.name}-${gi}-${ti}`} tool={tool} />
                ));
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
