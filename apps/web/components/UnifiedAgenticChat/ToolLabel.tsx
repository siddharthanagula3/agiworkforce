// apps/web/components/UnifiedAgenticChat/ToolLabel.tsx
'use client';

import { motion } from 'framer-motion';
import {
  FileText,
  Terminal,
  Search,
  Globe,
  Edit3,
  FolderOpen,
  GitBranch,
  Image,
  Database,
  Loader2,
  Check,
  X,
  Wrench,
  MousePointerClick,
  Code,
  Box,
  HelpCircle,
  ListTodo,
  Video,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolLabelEntry } from '@agiworkforce/types';
import React, { useState, useCallback } from 'react';

export type { ToolLabelEntry };

const ICON_MAP: Record<string, React.ElementType> = {
  // Filesystem
  Read: FileText,
  Write: FileText,
  Edit: Edit3,
  MultiEdit: Edit3,
  ApplyPatch: Edit3,
  LS: FolderOpen,
  // Search
  Search: Search,
  Grep: Search,
  CodeSearch: Code,
  Glob: FolderOpen,
  // Terminal
  Bash: Terminal,
  // Web
  WebSearch: Globe,
  WebFetch: Globe,
  // Data
  Memory: Database,
  // Git
  Git: GitBranch,
  // Media
  ImageGen: Image,
  VideoGen: Video,
  // Interactive
  Question: HelpCircle,
  TodoWrite: ListTodo,
  // Browser / UI automation — display names from toolDisplayNames.ts
  Click: MousePointerClick,
  Clicking: MousePointerClick,
  Browsing: Globe,
  Typing: Edit3,
  'Open website': Globe,
  'Take screenshot': Image,
  'Scroll page': Globe,
  'Type text': Edit3,
  // MCP fallback display names
  'Run database query': Database,
  'List tables': Database,
  'Read file': FileText,
  'Save file': FileText,
  'List files': FolderOpen,
  'List allowed folders': FolderOpen,
  'Run command': Terminal,
  'Run code': Code,
  'Search the web': Globe,
  'Create image': Image,
  'Create video': Video,
  // MCP source indicator
  MCP: Box,
};

const DIFF_EDIT_NAMES = new Set(['Edit', 'MultiEdit', 'ApplyPatch', 'Write']);
const MAX_DIFF_LINES_INITIAL = 20;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface DiffViewProps {
  diff: string;
}

function DiffView({ diff }: DiffViewProps) {
  const [showAll, setShowAll] = useState(false);

  const lines = diff.split('\n');
  const visibleLines = showAll ? lines : lines.slice(0, MAX_DIFF_LINES_INITIAL);
  const hasMore = lines.length > MAX_DIFF_LINES_INITIAL;

  return (
    <div className="mt-1.5 w-full">
      <div className="rounded-sm border border-white/10 overflow-hidden">
        <div className="overflow-x-auto max-h-60 overflow-y-auto">
          <pre className="font-mono text-xs leading-relaxed p-1.5 select-text">
            {visibleLines.map((line, i) => {
              const isAdded = line.startsWith('+');
              const isRemoved = line.startsWith('-');
              return (
                <div
                  key={i}
                  className={cn(
                    'px-1',
                    isAdded && 'bg-green-900/20 text-green-300',
                    isRemoved && 'bg-red-900/20 text-red-300',
                    !isAdded && !isRemoved && 'text-muted-foreground',
                  )}
                >
                  {line || ' '}
                </div>
              );
            })}
          </pre>
        </div>

        {hasMore && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="w-full px-2 py-1 text-xs text-center text-muted-foreground hover:text-foreground border-t border-white/10 transition-colors"
          >
            Show {lines.length - MAX_DIFF_LINES_INITIAL} more lines
          </button>
        )}
      </div>
    </div>
  );
}

export function ToolLabel({ entry }: { entry: ToolLabelEntry }) {
  const Icon = ICON_MAP[entry.displayName] ?? Wrench;
  const isRunning = entry.status === 'running';
  const isError = entry.status === 'error';
  const errorTitle = isError && entry.error ? entry.error : undefined;

  const [diffExpanded, setDiffExpanded] = useState(false);

  const isEditTool = DIFF_EDIT_NAMES.has(entry.displayName);
  const diffContent: string | undefined =
    isEditTool && !isRunning && (entry as ToolLabelEntry & { resultPreview?: string }).resultPreview
      ? (entry as ToolLabelEntry & { resultPreview?: string }).resultPreview
      : undefined;

  const hasDiff = Boolean(diffContent);

  const handleDiffToggle = useCallback(() => {
    setDiffExpanded((prev) => !prev);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'flex flex-col min-w-0 py-0.5 text-xs font-mono',
        isError ? 'text-red-400' : 'text-muted-foreground',
      )}
    >
      <div className="flex items-center gap-2">
        {/* Status indicator */}
        {isRunning ? (
          <Loader2 className="w-3 h-3 animate-spin text-violet-400 shrink-0" />
        ) : isError ? (
          <X className="w-3 h-3 text-red-400 shrink-0" />
        ) : (
          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
        )}

        {/* Tool icon */}
        <Icon className="w-3 h-3 shrink-0" />

        {/* Tool label: Name(args) */}
        <span className="truncate max-w-[300px]" title={errorTitle}>
          <span className="text-foreground/80">{entry.displayName}</span>
          {entry.displayArgs && (
            <span className="text-muted-foreground">({entry.displayArgs})</span>
          )}
          {isRunning && <span className="text-violet-400">...</span>}
        </span>

        {isError && entry.error && (
          <span className="truncate max-w-[240px] text-red-400/80" title={entry.error}>
            {entry.error}
          </span>
        )}

        {/* Duration */}
        {entry.durationMs != null && !isRunning && (
          <span className="text-muted-foreground/60 ml-auto tabular-nums shrink-0">
            {formatDuration(entry.durationMs)}
          </span>
        )}

        {/* Diff toggle */}
        {hasDiff && (
          <button
            type="button"
            onClick={handleDiffToggle}
            className="ml-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={diffExpanded ? 'Collapse diff' : 'Expand diff'}
          >
            {diffExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
        )}
      </div>

      {/* Inline diff view */}
      {hasDiff && diffExpanded && diffContent && (
        <div className="pl-8">
          <DiffView diff={diffContent} />
        </div>
      )}
    </motion.div>
  );
}
