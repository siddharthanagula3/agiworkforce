/**
 * Thinking Panel Component
 *
 * Shows LLM reasoning and planning steps with real-time streaming output.
 * Similar to Cursor Composer's thinking view.
 */

import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Clock, Loader2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useExecutionStore, selectSteps, selectActiveGoal, selectIsStreaming } from '../../stores/executionStore';
import type { ExecutionStep } from '../../stores/executionStore';
import { useState } from 'react';

export interface ThinkingPanelProps {
  className?: string;
}

export function ThinkingPanel({ className }: ThinkingPanelProps) {
  const activeGoal = useExecutionStore(selectActiveGoal);
  const steps = useExecutionStore(selectSteps);
  const isStreaming = useExecutionStore(selectIsStreaming);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (scrollRef.current && isStreaming) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps, isStreaming]);

  // Auto-expand active step
  useEffect(() => {
    const activeStep = steps.find((s) => s.status === 'in-progress');
    if (activeStep) {
      setExpandedSteps((prev) => new Set([...prev, activeStep.id]));
    }
  }, [steps]);

  const toggleStepExpansion = (stepId: string) => {
    setExpandedSteps((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  };

  if (!activeGoal) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No active execution</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start a goal to see AI reasoning here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground">
              {activeGoal.status === 'planning' && 'Planning approach...'}
              {activeGoal.status === 'executing' && 'Executing goal'}
              {activeGoal.status === 'completed' && 'Goal completed'}
              {activeGoal.status === 'failed' && 'Goal failed'}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {activeGoal.description}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-foreground">
              {activeGoal.completedSteps}/{activeGoal.totalSteps} steps
            </p>
            <p className="text-xs text-muted-foreground">{activeGoal.progressPercent}%</p>
          </div>
        </div>

        {/* Progress bar */}
        {activeGoal.status === 'executing' && (
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${activeGoal.progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Steps list */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {steps.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Waiting for plan...</p>
          </div>
        ) : (
          steps.map((step, index) => (
            <StepCard
              key={step.id}
              step={step}
              isLast={index === steps.length - 1}
              isExpanded={expandedSteps.has(step.id)}
              onToggleExpand={() => toggleStepExpansion(step.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ========================================
// Step Card Component
// ========================================

interface StepCardProps {
  step: ExecutionStep;
  isLast: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function StepCard({ step, isLast, isExpanded, onToggleExpand }: StepCardProps) {
  const statusConfig = getStepStatusConfig(step.status);
  const StatusIcon = statusConfig.icon;
  const hasReasoning = Boolean(step.llmReasoning && step.llmReasoning.trim());

  return (
    <div className="relative">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[11px] top-8 h-full w-0.5 bg-border" />
      )}

      {/* Step header */}
      <div
        className={cn(
          'relative flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/50',
          isExpanded && 'bg-accent/30',
        )}
        onClick={onToggleExpand}
      >
        {/* Status icon */}
        <div className="relative flex-shrink-0">
          <div
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full',
              statusConfig.bgColor,
            )}
          >
            <StatusIcon className={cn('h-3.5 w-3.5', statusConfig.iconColor, statusConfig.animate)} />
          </div>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={cn('text-sm font-medium', statusConfig.textColor)}>
              {step.description}
            </p>
            {hasReasoning && (
              <button
                type="button"
                className="flex-shrink-0 text-muted-foreground transition-transform hover:text-foreground"
                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Execution time */}
          {step.executionTimeMs !== undefined && (
            <p className="mt-1 text-xs text-muted-foreground">
              Completed in {formatExecutionTime(step.executionTimeMs)}
            </p>
          )}

          {/* Error message */}
          {step.error && (
            <div className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5">
              <p className="text-xs text-destructive">{step.error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Expanded reasoning */}
      {isExpanded && hasReasoning && (
        <div className="ml-9 mt-2 rounded-lg border border-border bg-card p-3">
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {step.llmReasoning || ''}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================================
// Helper Functions
// ========================================

function getStepStatusConfig(status: ExecutionStep['status']) {
  switch (status) {
    case 'pending':
      return {
        icon: Clock,
        bgColor: 'bg-muted',
        iconColor: 'text-muted-foreground',
        textColor: 'text-muted-foreground',
        animate: '',
      };
    case 'in-progress':
      return {
        icon: Loader2,
        bgColor: 'bg-primary/10',
        iconColor: 'text-primary',
        textColor: 'text-foreground',
        animate: 'animate-spin',
      };
    case 'completed':
      return {
        icon: Check,
        bgColor: 'bg-green-500/10',
        iconColor: 'text-green-500',
        textColor: 'text-foreground',
        animate: '',
      };
    case 'failed':
      return {
        icon: XCircle,
        bgColor: 'bg-destructive/10',
        iconColor: 'text-destructive',
        textColor: 'text-foreground',
        animate: '',
      };
  }
}

function formatExecutionTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export default ThinkingPanel;
