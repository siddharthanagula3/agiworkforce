// apps/desktop/src/components/UnifiedAgenticChat/AgentStepTimeline.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

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

interface AgentStepTimelineProps {
  steps: AgentStep[];
  compact?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Color helpers
// ────────────────────────────────────────────────────────────────────────────

function agentTypeBadgeClasses(agentType: AgentType): string {
  switch (agentType) {
    case 'planner':
      return 'bg-purple-500/15 text-purple-300 border border-purple-500/25';
    case 'executor':
      return 'bg-blue-500/15 text-blue-300 border border-blue-500/25';
    case 'reviewer':
      return 'bg-green-500/15 text-green-300 border border-green-500/25';
    case 'coordinator':
      return 'bg-orange-500/15 text-orange-300 border border-orange-500/25';
    default:
      return 'bg-slate-500/15 text-slate-300 border border-slate-500/25';
  }
}

function statusDotClasses(status: StepStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-slate-500 border-slate-600';
    case 'running':
      return 'bg-amber-400 border-amber-500 animate-pulse';
    case 'complete':
      return 'bg-green-400 border-green-500';
    case 'error':
      return 'bg-red-400 border-red-500';
    case 'skipped':
      return 'bg-slate-600 border-slate-700 opacity-50';
    default:
      return 'bg-slate-500 border-slate-600';
  }
}

function statusLabelClasses(status: StepStatus): string {
  switch (status) {
    case 'running':
      return 'text-amber-300';
    case 'complete':
      return 'text-green-300';
    case 'error':
      return 'text-red-300';
    case 'skipped':
      return 'text-slate-500';
    default:
      return 'text-slate-300';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Duration helpers
// ────────────────────────────────────────────────────────────────────────────

function formatDuration(startedAt?: number, completedAt?: number): string | null {
  if (!startedAt || !completedAt) return null;
  const ms = completedAt - startedAt;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ────────────────────────────────────────────────────────────────────────────
// Single step item
// ────────────────────────────────────────────────────────────────────────────

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
            className="flex-1 border-l-2 border-slate-700 mt-1"
            style={{ minHeight: compact ? 12 : 16 }}
          />
        )}
      </div>

      {/* Right: content */}
      <div className={cn('flex-1 min-w-0', isLast ? 'pb-0' : compact ? 'pb-2' : 'pb-3')}>
        {/* Row: badge + label + duration */}
        <button
          type="button"
          className={cn(
            'flex flex-wrap items-center gap-1.5 w-full text-left',
            hasDetails ? 'cursor-pointer' : 'cursor-default',
          )}
          onClick={hasDetails ? () => setExpanded((v) => !v) : undefined}
          disabled={!hasDetails}
          tabIndex={hasDetails ? 0 : -1}
        >
          {/* Agent type badge */}
          <span
            className={cn(
              'text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded',
              agentTypeBadgeClasses(step.agentType),
            )}
          >
            {step.agentType}
          </span>

          {/* Step label */}
          <span
            className={cn(
              'text-xs flex-1 min-w-0 truncate',
              statusLabelClasses(step.status),
              step.status === 'skipped' && 'line-through',
            )}
          >
            {step.label}
          </span>

          {/* Duration (complete only) */}
          {duration && step.status === 'complete' && (
            <span className="text-[10px] text-slate-500 font-mono tabular-nums shrink-0">
              {duration}
            </span>
          )}

          {/* Expand chevron */}
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

        {/* Details (expandable) */}
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
              <p className="mt-1.5 text-[11px] text-slate-400/80 font-mono leading-snug whitespace-pre-wrap bg-slate-900/30 rounded px-2 py-1.5 border border-slate-700/30">
                {step.details}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

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
