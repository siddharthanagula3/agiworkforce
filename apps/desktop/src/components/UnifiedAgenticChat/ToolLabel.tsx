// apps/desktop/src/components/UnifiedAgenticChat/ToolLabel.tsx
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
} from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ToolLabelEntry {
  id: string;
  displayName: string;
  displayArgs: string;
  status: 'running' | 'completed' | 'error';
  durationMs?: number;
  error?: string;
  /** Optional group identifier for visually grouping parallel tool executions. */
  parallelGroup?: string;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Read: FileText,
  Write: FileText,
  Edit: Edit3,
  LS: FolderOpen,
  Search: Search,
  Bash: Terminal,
  WebSearch: Globe,
  WebFetch: Globe,
  Memory: Database,
  Git: GitBranch,
  ImageGen: Image,
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ToolLabel({ entry }: { entry: ToolLabelEntry }) {
  const Icon = ICON_MAP[entry.displayName] ?? Wrench;
  const isRunning = entry.status === 'running';
  const isError = entry.status === 'error';
  const errorTitle = isError && entry.error ? entry.error : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'flex min-w-0 items-center gap-2 py-0.5 text-xs font-mono',
        isError ? 'text-red-400' : 'text-muted-foreground',
      )}
    >
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
        {entry.displayArgs && <span className="text-muted-foreground">({entry.displayArgs})</span>}
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
    </motion.div>
  );
}
