import { AnimatePresence, motion } from 'framer-motion';
import { Brain, CheckCircle, Code, Loader2, Play, Search, XCircle } from 'lucide-react';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { useUnifiedChatStore, type ActionTrailEntry } from '@/stores/unified/unifiedChatStore';

interface StatusTrailProps {
  messageId?: string;
  className?: string;
  variant?: 'absolute' | 'inline';
}

interface FloatingStatusTrailProps {
  messageId?: string;
  className?: string;
}

const ACTIVE_TYPES = new Set<ActionTrailEntry['type']>([
  'thinking',
  'searching',
  'coding',
  'running',
]);

function getIconForType(type: ActionTrailEntry['type']) {
  switch (type) {
    case 'thinking':
      return <Brain className="h-4 w-4" aria-hidden="true" />;
    case 'searching':
      return <Search className="h-4 w-4" aria-hidden="true" />;
    case 'coding':
      return <Code className="h-4 w-4" aria-hidden="true" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
    case 'completed':
      return <CheckCircle className="h-4 w-4" aria-hidden="true" />;
    case 'error':
      return <XCircle className="h-4 w-4" aria-hidden="true" />;
    default:
      return <Play className="h-4 w-4" aria-hidden="true" />;
  }
}

function getTone(type: ActionTrailEntry['type']) {
  switch (type) {
    case 'thinking':
      return {
        icon: 'text-agent-thinking',
        text: 'text-foreground',
        container: 'border-agent-thinking/20 bg-agent-thinking/5',
        progress: 'bg-agent-thinking',
      };
    case 'searching':
      return {
        icon: 'text-teal-400',
        text: 'text-foreground',
        container: 'border-teal-500/20 bg-teal-500/5',
        progress: 'bg-teal-500',
      };
    case 'coding':
      return {
        icon: 'text-agent-active',
        text: 'text-foreground',
        container: 'border-agent-active/20 bg-agent-active/5',
        progress: 'bg-agent-active',
      };
    case 'running':
      return {
        icon: 'text-agent-warning',
        text: 'text-foreground',
        container: 'border-agent-warning/20 bg-agent-warning/5',
        progress: 'bg-agent-warning',
      };
    case 'completed':
      return {
        icon: 'text-agent-success',
        text: 'text-foreground',
        container: 'border-agent-success/20 bg-agent-success/5',
        progress: 'bg-agent-success',
      };
    case 'error':
      return {
        icon: 'text-agent-error',
        text: 'text-foreground',
        container: 'border-agent-error/20 bg-agent-error/5',
        progress: 'bg-agent-error',
      };
    default:
      return {
        icon: 'text-muted-foreground',
        text: 'text-foreground',
        container: 'border-border/50 bg-surface-elevated',
        progress: 'bg-primary',
      };
  }
}

function formatTimestamp(timestamp: Date) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getProgress(entry: ActionTrailEntry) {
  return (
    entry.progress ??
    (entry.currentStep && entry.totalSteps
      ? Math.round((entry.currentStep / entry.totalSteps) * 100)
      : undefined)
  );
}

function getVisibleEntries(entries: ActionTrailEntry[], isFloating: boolean) {
  if (isFloating) {
    return [...entries].slice(-6).reverse();
  }

  const activeEntries = entries.filter((entry) => ACTIVE_TYPES.has(entry.type)).slice(-2);
  const latestFinished = [...entries].reverse().find((entry) => !ACTIVE_TYPES.has(entry.type));
  const visible = latestFinished
    ? [...activeEntries, latestFinished].filter(
        (entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index,
      )
    : activeEntries;

  return visible.slice(-3).reverse();
}

function StatusTrailItem({
  entry,
  prefersReducedMotion = false,
}: {
  entry: ActionTrailEntry;
  prefersReducedMotion?: boolean;
}) {
  const isInProgress = ACTIVE_TYPES.has(entry.type);
  const tone = getTone(entry.type);
  const progress = getProgress(entry);

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
      transition={
        prefersReducedMotion
          ? { duration: 0.12 }
          : {
              type: 'spring',
              stiffness: 340,
              damping: 28,
            }
      }
      className={cn('rounded-2xl border px-3.5 py-3 shadow-xs backdrop-blur-sm', tone.container)}
      role="status"
      aria-label={`${entry.type}: ${entry.message}`}
      aria-live={isInProgress ? 'polite' : 'off'}
    >
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 shrink-0', tone.icon)}>{getIconForType(entry.type)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <span className={cn('text-sm font-medium leading-5', tone.text)}>{entry.message}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatTimestamp(entry.timestamp)}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {progress !== undefined && isInProgress ? (
              <span className="tabular-nums">{progress}%</span>
            ) : null}
            {entry.currentStep !== undefined && entry.totalSteps !== undefined ? (
              <span className="tabular-nums">
                Step {entry.currentStep}/{entry.totalSteps}
              </span>
            ) : null}
          </div>

          {progress !== undefined && isInProgress ? (
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background/70"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${entry.message} progress`}
            >
              <motion.div
                className={cn('h-full rounded-full', tone.progress)}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: prefersReducedMotion ? 0.1 : 0.25, ease: 'easeOut' }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

export function StatusTrail({ messageId, className, variant = 'inline' }: StatusTrailProps) {
  const prefersReducedMotion = useReducedMotion();
  const getActiveActionTrail = useUnifiedChatStore((state) => state.getActiveActionTrail);
  const actionTrail = getActiveActionTrail(messageId);
  const visibleEntries = getVisibleEntries(actionTrail, false);

  if (visibleEntries.length === 0) {
    return null;
  }

  const hasActiveItems = visibleEntries.some((entry) => ACTIVE_TYPES.has(entry.type));

  return (
    <div
      className={cn(
        variant === 'absolute' ? 'absolute -top-20 left-0 right-0' : 'relative mb-4',
        'flex flex-col gap-2 px-4 py-2',
        className,
      )}
      role="region"
      aria-label="Action status trail"
      aria-busy={hasActiveItems}
    >
      <AnimatePresence mode="popLayout">
        {visibleEntries.map((entry) => (
          <StatusTrailItem
            key={entry.id}
            entry={entry}
            prefersReducedMotion={prefersReducedMotion}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

export function FloatingStatusTrail({ messageId, className }: FloatingStatusTrailProps) {
  const prefersReducedMotion = useReducedMotion();
  const getActiveActionTrail = useUnifiedChatStore((state) => state.getActiveActionTrail);
  const actionTrail = getActiveActionTrail(messageId);
  const visibleEntries = getVisibleEntries(actionTrail, true);

  if (visibleEntries.length === 0) {
    return null;
  }

  const hasActiveItems = visibleEntries.some((entry) => ACTIVE_TYPES.has(entry.type));

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
      transition={{ duration: prefersReducedMotion ? 0.12 : 0.18 }}
      className={cn(
        'fixed right-6 top-20 z-40 flex w-96 max-w-[calc(100vw-3rem)] flex-col gap-3 rounded-2xl border border-border/60 bg-background/95 p-4 shadow-2xl backdrop-blur-xl',
        className,
      )}
      role="region"
      aria-label="Floating action status trail"
      aria-busy={hasActiveItems}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Agent Activity</h4>
          <p className="text-xs text-muted-foreground">
            Live progress plus the most recent result states.
          </p>
        </div>
        <span className="rounded-full border border-border/60 bg-surface-elevated px-2 py-1 text-[11px] text-muted-foreground">
          {visibleEntries.length} shown
        </span>
      </div>

      <AnimatePresence mode="popLayout">
        {visibleEntries.map((entry) => (
          <StatusTrailItem
            key={entry.id}
            entry={entry}
            prefersReducedMotion={prefersReducedMotion}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
