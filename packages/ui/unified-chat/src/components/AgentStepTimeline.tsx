import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

export type AgentType = 'planner' | 'executor' | 'reviewer' | 'coordinator' | string;
export type StepStatus = 'pending' | 'running' | 'complete' | 'error' | 'skipped';

export interface AgentStep {
  id: string;
  agentType: AgentType;
  label: string;
  status: StepStatus;
  startedAt?: number;
  completedAt?: number;
  details?: string;
}

export interface AgentStepTimelineProps {
  steps: AgentStep[];
  compact?: boolean;
}

function agentTypeBadgeClasses(agentType: AgentType): string {
  switch (agentType) {
    case 'planner':
      return 'bg-muted text-info-text border border-border';
    case 'executor':
      return 'bg-muted text-info-text border border-border';
    case 'reviewer':
      return 'bg-success-fill/10 text-success-text border border-success-fill/25';
    case 'coordinator':
      return 'bg-warning-fill/10 text-warning-text border border-warning-fill/25';
    default:
      return 'bg-slate-500/15 text-slate-300 border border-slate-500/25';
  }
}

function statusDotClasses(status: StepStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-slate-500 border-slate-600';
    case 'running':
      return 'bg-warning-fill border-warning-fill animate-pulse';
    case 'complete':
      return 'bg-success-fill border-success-fill';
    case 'error':
      return 'bg-danger-fill border-danger-fill';
    case 'skipped':
      return 'bg-muted-foreground border-border opacity-50';
    default:
      return 'bg-muted-foreground border-border';
  }
}

function statusLabelClasses(status: StepStatus): string {
  switch (status) {
    case 'running':
      return 'text-warning-text';
    case 'complete':
      return 'text-success-text';
    case 'error':
      return 'text-danger-text';
    case 'skipped':
      return 'text-slate-500';
    default:
      return 'text-slate-300';
  }
}

function formatDuration(startedAt?: number, completedAt?: number): string | null {
  if (!startedAt || !completedAt) return null;
  const ms = completedAt - startedAt;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface StepItemProps {
  step: AgentStep;
  isLast: boolean;
  compact: boolean;
}

function StepItem({ step, isLast, compact }: StepItemProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = Boolean(step.details) && !compact;
  const duration = formatDuration(step.startedAt, step.completedAt);

  return (
    <div className="flex gap-3">
      {/* Left rail: dot + connecting line */}
      <div className="flex flex-col items-center shrink-0">
        <span
          className={cn(
            'w-2.5 h-2.5 rounded-full border-2 shrink-0',
            statusDotClasses(step.status),
            compact ? 'mt-1' : 'mt-1.5',
          )}
        />
        {!isLast && (
          <div
            className="flex-1 border-s-2 border-slate-700 mt-1"
            style={{ minHeight: compact ? 12 : 16 }}
          />
        )}
      </div>

      {/* Right: content */}
      <div className={cn('flex-1 min-w-0', isLast ? 'pb-0' : compact ? 'pb-2' : 'pb-3')}>
        <button
          type="button"
          className={cn(
            'flex flex-wrap items-center gap-1.5 w-full text-start',
            hasDetails ? 'cursor-pointer' : 'cursor-default',
          )}
          onClick={hasDetails ? () => setExpanded((v) => !v) : undefined}
          disabled={!hasDetails}
          tabIndex={hasDetails ? 0 : -1}
        >
          <span
            className={cn(
              'text-caption font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-compact',
              agentTypeBadgeClasses(step.agentType),
            )}
          >
            {step.agentType}
          </span>

          <span
            className={cn(
              'text-xs flex-1 min-w-0 truncate',
              statusLabelClasses(step.status),
              step.status === 'skipped' && 'line-through',
            )}
          >
            {step.label}
          </span>

          {duration && step.status === 'complete' && (
            <span className="text-caption text-slate-500 font-mono tabular-nums shrink-0">
              {duration}
            </span>
          )}

          {hasDetails && (
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.15 }}
              className="text-slate-500 shrink-0"
            >
              <ChevronDown className="w-3 h-3" />
            </motion.div>
          )}
        </button>

        <AnimatePresence initial={false}>
          {expanded && step.details && (
            <motion.div
              key="details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.2, ease: 'easeInOut' },
                opacity: { duration: 0.15 },
              }}
              className="overflow-hidden"
            >
              <p className="mt-1.5 text-caption text-muted-foreground font-mono leading-snug whitespace-pre-wrap bg-card/30 rounded-compact px-2 py-1.5 border border-border/30">
                {step.details}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function AgentStepTimeline({ steps, compact = false }: AgentStepTimelineProps) {
  if (steps.length === 0) return null;

  return (
    <div className={cn('flex flex-col', 'gap-0')}>
      {steps.map((step, index) => (
        <motion.div
          key={step.id}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: Math.min(index * 0.05, 0.5) }}
        >
          <StepItem step={step} isLast={index === steps.length - 1} compact={compact} />
        </motion.div>
      ))}
    </div>
  );
}
