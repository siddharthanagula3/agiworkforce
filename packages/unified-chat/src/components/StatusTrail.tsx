// packages/unified-chat/src/components/StatusTrail.tsx
// Ported from apps/desktop/src/components/UnifiedAgenticChat/StatusTrail.tsx
//
// Changes vs source:
//  - ActionTrailEntry imported from budgetStore (already ships in unified-chat)
//  - useReducedMotion moved to hooks/useReducedMotion (ported alongside)
//  - StatusTrail now accepts actionTrail as a prop (host provides it)
//  - StatusTrailConnected reads from budgetStore.actionTrail directly
//  - FloatingStatusTrail is also props-driven (accepts actionTrail)

import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Search, Code, Play, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { type ActionTrailEntry, useBudgetStore } from '../stores/budgetStore';
import { useReducedMotion } from '../hooks/useReducedMotion';

// Re-export for consumers
export type { ActionTrailEntry };

// ─────────────────────────────────────────────────────────────────────────────
// Icons + colours
// ─────────────────────────────────────────────────────────────────────────────

function getIconForType(type: ActionTrailEntry['type']) {
  switch (type) {
    case 'thinking':
      return <Brain className="w-4 h-4 animate-pulse" aria-hidden="true" />;
    case 'searching':
      return <Search className="w-4 h-4 animate-pulse" aria-hidden="true" />;
    case 'coding':
      return <Code className="w-4 h-4 animate-pulse" aria-hidden="true" />;
    case 'running':
      return <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />;
    case 'completed':
      return <CheckCircle className="w-4 h-4" aria-hidden="true" />;
    case 'error':
      return <XCircle className="w-4 h-4" aria-hidden="true" />;
    default:
      return <Play className="w-4 h-4" aria-hidden="true" />;
  }
}

function getColorForType(type: ActionTrailEntry['type']) {
  switch (type) {
    case 'thinking':
      return 'text-agent-thinking';
    case 'searching':
      return 'text-teal';
    case 'coding':
      return 'text-agent-active';
    case 'running':
      return 'text-agent-warning';
    case 'completed':
      return 'text-agent-success';
    case 'error':
      return 'text-agent-error';
    default:
      return 'text-muted-foreground';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusTrailItem
// ─────────────────────────────────────────────────────────────────────────────

interface StatusTrailItemProps {
  entry: ActionTrailEntry;
  prefersReducedMotion?: boolean;
}

function StatusTrailItem({ entry, prefersReducedMotion = false }: StatusTrailItemProps) {
  const isInProgress = ['thinking', 'searching', 'coding', 'running'].includes(entry.type);
  const isCompleted = entry.type === 'completed';
  const isError = entry.type === 'error';

  const progress =
    entry.progress ??
    (entry.currentStep && entry.totalSteps
      ? Math.round((entry.currentStep / entry.totalSteps) * 100)
      : undefined);

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -10, scale: 0.95 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -10, scale: 0.95 }}
      transition={
        prefersReducedMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 300, damping: 25 }
      }
      className={cn(
        'flex flex-col gap-1.5 px-3 py-2 rounded-lg',
        'bg-muted/50 backdrop-blur-xs',
        'border border-white/5',
        isCompleted && 'bg-emerald-900/20 border-emerald-500/20',
        isError && 'bg-rose-900/20 border-rose-500/20',
      )}
      role="status"
      aria-label={`${entry.type}: ${entry.message}`}
      aria-live={isInProgress ? 'polite' : 'off'}
    >
      <div className="flex items-center gap-2">
        <span className={cn('shrink-0', getColorForType(entry.type))}>
          {getIconForType(entry.type)}
        </span>
        <span className={cn('text-sm font-medium flex-1', getColorForType(entry.type))}>
          {entry.message}
        </span>
        {progress !== undefined && isInProgress && (
          <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
        )}
        {entry.currentStep !== undefined && entry.totalSteps !== undefined && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {entry.currentStep}/{entry.totalSteps}
          </span>
        )}
      </div>

      {progress !== undefined && isInProgress && (
        <div
          className="w-full h-1 bg-accent/50 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${entry.message} progress`}
        >
          <motion.div
            className={cn(
              'h-full rounded-full',
              entry.type === 'thinking' && 'bg-amber-500',
              entry.type === 'searching' && 'bg-teal-500',
              entry.type === 'coding' && 'bg-blue-500',
              entry.type === 'running' && 'bg-amber-500',
            )}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: prefersReducedMotion ? 0.1 : 0.3, ease: 'easeOut' }}
          />
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusTrailContent — props-driven (for testing + explicit control)
// ─────────────────────────────────────────────────────────────────────────────

export interface StatusTrailContentProps {
  actionTrail: ActionTrailEntry[];
  className?: string;
  prefersReducedMotion?: boolean;
  variant?: 'absolute' | 'inline';
}

export function StatusTrailContent({
  actionTrail,
  className,
  prefersReducedMotion = false,
  variant = 'inline',
}: StatusTrailContentProps) {
  if (actionTrail.length === 0) {
    return null;
  }

  const hasActiveItems = actionTrail.some((entry) =>
    ['thinking', 'searching', 'coding', 'running'].includes(entry.type),
  );

  return (
    <div
      className={cn(
        variant === 'absolute' ? 'absolute -top-20 left-0 right-0' : 'relative mb-4',
        'flex flex-col gap-2',
        'px-4 py-2',
        className,
      )}
      role="region"
      aria-label="Action status trail"
      aria-busy={hasActiveItems}
    >
      <AnimatePresence mode="popLayout">
        {actionTrail.map((entry) => (
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

// ─────────────────────────────────────────────────────────────────────────────
// StatusTrail — store-connected (reads from budgetStore.actionTrail)
// ─────────────────────────────────────────────────────────────────────────────

export interface StatusTrailProps {
  className?: string;
  variant?: 'absolute' | 'inline';
}

export function StatusTrail({ className, variant = 'inline' }: StatusTrailProps) {
  const prefersReducedMotion = useReducedMotion();
  const actionTrail = useBudgetStore((s) => s.actionTrail);

  return (
    <StatusTrailContent
      actionTrail={actionTrail}
      className={className}
      prefersReducedMotion={prefersReducedMotion}
      variant={variant}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FloatingStatusTrail — fixed overlay, reads from budgetStore
// ─────────────────────────────────────────────────────────────────────────────

export interface FloatingStatusTrailProps {
  className?: string;
}

export function FloatingStatusTrail({ className }: FloatingStatusTrailProps) {
  const prefersReducedMotion = useReducedMotion();
  const actionTrail = useBudgetStore((s) => s.actionTrail);

  if (actionTrail.length === 0) {
    return null;
  }

  const hasActiveItems = actionTrail.some((entry) =>
    ['thinking', 'searching', 'coding', 'running'].includes(entry.type),
  );

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
      transition={{ duration: prefersReducedMotion ? 0.15 : 0.2 }}
      className={cn(
        'fixed top-20 right-6 z-40',
        'w-80 max-w-[calc(100vw-3rem)]',
        'flex flex-col gap-2',
        'p-4 rounded-xl',
        'bg-card/90 backdrop-blur-xl',
        'border border-white/10',
        'shadow-2xl',
        className,
      )}
      role="region"
      aria-label="Floating action status trail"
      aria-busy={hasActiveItems}
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Agent Activity
        </h4>
        <span className="text-xs text-muted-foreground">{actionTrail.length} active</span>
      </div>
      <AnimatePresence mode="popLayout">
        {actionTrail.map((entry) => (
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
