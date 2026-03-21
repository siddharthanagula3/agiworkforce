import { useMemo, useState, type ElementType } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FolderTree,
  Globe,
  Shield,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ActionLogEntry } from '../../stores/unifiedChatStore';
import { cn } from '../../lib/utils';
import { useMessageActionLog } from './useMessageRuntimeActivity';

const TYPE_ICON_MAP: Record<ActionLogEntry['type'], ElementType> = {
  plan: Activity,
  terminal: Terminal,
  filesystem: FolderTree,
  browser: Globe,
  ui: Wrench,
  mcp: Wrench,
  approval: Shield,
  metrics: Activity,
};

const STATUS_ICON_MAP: Record<ActionLogEntry['status'], ElementType> = {
  pending: Clock3,
  running: Activity,
  success: CheckCircle2,
  failed: XCircle,
  blocked: AlertTriangle,
};

const STATUS_CLASS_MAP: Record<ActionLogEntry['status'], string> = {
  pending: 'text-slate-400 border-slate-700/60 bg-slate-900/40',
  running: 'text-amber-300 border-amber-500/30 bg-amber-500/5',
  success: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/5',
  failed: 'text-red-300 border-red-500/30 bg-red-500/5',
  blocked: 'text-yellow-300 border-yellow-500/30 bg-yellow-500/5',
};

interface ActionLogTimelineProps {
  messageId: string;
  className?: string;
}

function ActionLogItem({ entry }: { entry: ActionLogEntry }) {
  const TypeIcon = TYPE_ICON_MAP[entry.type] ?? Wrench;
  const StatusIcon = STATUS_ICON_MAP[entry.status] ?? Activity;
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const details = useMemo(() => {
    if (!entry.metadata || Object.keys(entry.metadata).length === 0) {
      return null;
    }

    const sanitizedMetadata = Object.fromEntries(
      Object.entries(entry.metadata).filter(([key]) => key !== 'messageId'),
    );
    if (Object.keys(sanitizedMetadata).length === 0) {
      return null;
    }

    try {
      return JSON.stringify(sanitizedMetadata, null, 2);
    } catch {
      return String(sanitizedMetadata);
    }
  }, [entry.metadata]);

  return (
    <div className={cn('rounded-lg border p-2.5', STATUS_CLASS_MAP[entry.status])}>
      <div className="flex items-start gap-2">
        <StatusIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <TypeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-medium">{entry.title}</p>
            <span className="shrink-0 text-[10px] uppercase tracking-wide opacity-80">
              {entry.status}
            </span>
          </div>
          {entry.description && <p className="mt-1 text-[11px] opacity-85">{entry.description}</p>}
          {entry.result && (
            <p className="mt-1 text-[11px] text-emerald-200/90 line-clamp-3">{entry.result}</p>
          )}
          {entry.error && (
            <p className="mt-1 text-[11px] text-red-200/90 line-clamp-3">{entry.error}</p>
          )}
          {details && (
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => setIsDetailsOpen((value) => !value)}
                className="flex items-center gap-1 text-[10px] opacity-80 transition-colors hover:opacity-100"
                aria-expanded={isDetailsOpen}
              >
                <motion.div
                  animate={{ rotate: isDetailsOpen ? 180 : 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <ChevronDown className="h-3 w-3" />
                </motion.div>
                Details
              </button>
              <AnimatePresence initial={false}>
                {isDetailsOpen && (
                  <motion.pre
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="mt-1 overflow-hidden whitespace-pre-wrap rounded bg-black/20 px-2 py-1.5 text-[10px] text-slate-300/90"
                  >
                    {details}
                  </motion.pre>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ActionLogTimelineContentProps {
  entries: ActionLogEntry[];
  className?: string;
}

export function ActionLogTimelineContent({ entries, className }: ActionLogTimelineContentProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasActiveEntries = entries.some(
    (entry) => entry.status === 'running' || entry.status === 'blocked',
  );
  const isOpen = hasActiveEntries || isExpanded;

  if (entries.length === 0) {
    return null;
  }

  return (
    <div
      className={cn('overflow-hidden rounded-lg border border-white/10 bg-zinc-900/25', className)}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-white/5"
        aria-expanded={isOpen}
      >
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="h-3.5 w-3.5" />
        </motion.div>
        <Activity className="h-3.5 w-3.5" />
        <span className="font-medium">
          Agent activity
          <span className="ml-1 text-zinc-500">({entries.length})</span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="space-y-2 px-3 py-2">
              {entries.map((entry) => (
                <ActionLogItem key={entry.id} entry={entry} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ActionLogTimeline({ messageId, className }: ActionLogTimelineProps) {
  const entries = useMessageActionLog(messageId);

  return <ActionLogTimelineContent entries={entries} className={className} />;
}

export default ActionLogTimeline;
