// SubtaskTimeline.tsx
// Vertical timeline showing task execution steps with framer-motion expand/collapse.
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, ChevronDown, Circle, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SubtaskStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  output?: string;
}

interface SubtaskTimelineProps {
  taskId: string;
  steps: SubtaskStep[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Duration helper
// ─────────────────────────────────────────────────────────────────────────────

function formatDuration(startedAt?: Date, completedAt?: Date): string | null {
  if (!startedAt || !completedAt) return null;
  const ms = completedAt.getTime() - startedAt.getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step icon
// ─────────────────────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: SubtaskStep['status'] }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />;
    case 'failed':
      return <XCircle className="h-4 w-4 shrink-0 text-red-400" />;
    case 'running':
      return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-400" />;
    default:
      return <Circle className="h-4 w-4 shrink-0 text-zinc-600" />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Single step row
// ─────────────────────────────────────────────────────────────────────────────

interface StepRowProps {
  step: SubtaskStep;
  isLast: boolean;
}

function StepRow({ step, isLast }: StepRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = Boolean(step.output);
  const duration = formatDuration(step.startedAt, step.completedAt);

  const descriptionColor =
    step.status === 'done'
      ? 'text-zinc-300'
      : step.status === 'failed'
        ? 'text-red-300'
        : step.status === 'running'
          ? 'text-blue-300'
          : 'text-zinc-500';

  return (
    <div className="flex gap-3">
      {/* Left rail */}
      <div className="flex shrink-0 flex-col items-center">
        <div className="mt-0.5">
          <StepIcon status={step.status} />
        </div>
        {!isLast && (
          <div
            className={cn(
              'mt-1 w-px flex-1',
              step.status === 'done'
                ? 'bg-green-400/30'
                : step.status === 'failed'
                  ? 'bg-red-400/30'
                  : 'bg-zinc-700',
            )}
            style={{ minHeight: 16 }}
          />
        )}
      </div>

      {/* Content */}
      <div className={cn('min-w-0 flex-1', isLast ? 'pb-0' : 'pb-4')}>
        <button
          type="button"
          className={cn(
            'flex w-full items-start gap-2 text-left',
            hasOutput ? 'cursor-pointer' : 'cursor-default',
          )}
          onClick={hasOutput ? () => setExpanded((v) => !v) : undefined}
          disabled={!hasOutput}
          tabIndex={hasOutput ? 0 : -1}
          aria-expanded={hasOutput ? expanded : undefined}
        >
          <span className={cn('flex-1 truncate text-sm', descriptionColor)}>
            {step.description}
          </span>

          <div className="flex shrink-0 items-center gap-2">
            {duration && (
              <span className="font-mono text-[10px] tabular-nums text-zinc-500">{duration}</span>
            )}
            {hasOutput && (
              <motion.span
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.15 }}
                className="text-zinc-500"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </motion.span>
            )}
          </div>
        </button>

        {/* Expandable output */}
        <AnimatePresence initial={false}>
          {expanded && step.output && (
            <motion.div
              key="output"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.2, ease: 'easeInOut' },
                opacity: { duration: 0.15 },
              }}
              className="overflow-hidden"
            >
              <pre className="mt-2 overflow-x-auto rounded border border-white/10 bg-zinc-900/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-400 whitespace-pre-wrap">
                {step.output}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function SubtaskTimeline({ taskId: _taskId, steps }: SubtaskTimelineProps) {
  if (steps.length === 0) {
    return <p className="py-3 text-center text-xs text-zinc-600">No execution steps yet.</p>;
  }

  return (
    <div className="flex flex-col">
      {steps.map((step, index) => (
        <motion.div
          key={step.id}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.18, delay: Math.min(index * 0.04, 0.4) }}
        >
          <StepRow step={step} isLast={index === steps.length - 1} />
        </motion.div>
      ))}
    </div>
  );
}
