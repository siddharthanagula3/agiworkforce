/**
 * ToolExecutionTimeline Component
 *
 * Visualize multi-step agent workflows with a timeline view.
 * Shows tool execution steps, dependencies, and overall progress.
 */

import { useMemo } from 'react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ChevronRight,
  Target,
  TrendingUp,
} from 'lucide-react';
import { ToolCallCard } from './ToolCallCard';
import { ToolResultCard } from './ToolResultCard';
import { ToolErrorDisplay } from './ToolErrorDisplay';
import { cn } from '../../lib/utils';
import type { ToolExecutionWorkflow, ToolExecutionStep } from '../../types/toolCalling';

interface ToolExecutionTimelineProps {
  workflow: ToolExecutionWorkflow;
  onCancelTool?: (toolCallId: string) => void;
  onApproveTool?: (toolCallId: string) => void;
  onRejectTool?: (toolCallId: string) => void;
  onRetryTool?: (toolCallId: string) => void;
  className?: string;
  compact?: boolean;
}

function TimelineConnector({ active = false }: { active?: boolean }) {
  return (
    <div className="flex flex-col items-center py-1">
      <div
        className={cn(
          'w-0.5 h-full',
          active ? 'bg-primary' : 'bg-border',
        )}
      />
    </div>
  );
}

function TimelineStep({
  step,
  isLast,
  onCancelTool,
  onApproveTool,
  onRejectTool,
  onRetryTool,
}: {
  step: ToolExecutionStep;
  isLast: boolean;
  onCancelTool?: (toolCallId: string) => void;
  onApproveTool?: (toolCallId: string) => void;
  onRejectTool?: (toolCallId: string) => void;
  onRetryTool?: (toolCallId: string) => void;
}) {
  const hasChildren = step.children && step.children.length > 0;
  const hasResult = Boolean(step.result);
  const isFailed = step.tool_call.status === 'failed';

  return (
    <div className="flex gap-3">
      {/* Timeline Rail */}
      <div className="flex flex-col items-center">
        {/* Step Number Badge */}
        <div
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0',
            step.tool_call.status === 'completed' &&
              'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-2 border-green-500',
            step.tool_call.status === 'failed' &&
              'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-2 border-red-500',
            step.tool_call.status === 'in_progress' &&
              'bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-2 border-blue-500',
            step.tool_call.status === 'pending' &&
              'bg-muted text-muted-foreground border-2 border-border',
            step.tool_call.status === 'awaiting_approval' &&
              'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300 border-2 border-yellow-500',
          )}
        >
          {step.step_number}
        </div>

        {/* Connector */}
        {!isLast && (
          <TimelineConnector active={step.tool_call.status === 'completed' || step.tool_call.status === 'in_progress'} />
        )}
      </div>

      {/* Step Content */}
      <div className="flex-1 pb-6">
        {/* Tool Call */}
        <ToolCallCard
          toolCall={step.tool_call}
          onCancel={onCancelTool}
          onApprove={onApproveTool}
          onReject={onRejectTool}
          defaultExpanded={step.tool_call.status === 'in_progress' || step.tool_call.status === 'awaiting_approval'}
        />

        {/* Tool Result */}
        {hasResult && step.result && (
          <div className="mt-3">
            {isFailed ? (
              <ToolErrorDisplay
                error={step.result.error || 'Unknown error'}
                toolName={step.tool_call.tool_name}
                parameters={step.tool_call.parameters}
                retryable={true}
                onRetry={() => onRetryTool?.(step.tool_call.id)}
              />
            ) : (
              <ToolResultCard result={step.result} />
            )}
          </div>
        )}

        {/* Nested Steps (Dependencies) */}
        {hasChildren && (
          <div className="mt-3 ml-6 border-l-2 border-dashed border-border pl-4">
            <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
              <ChevronRight className="h-3.5 w-3.5" />
              Sub-tasks ({step.children!.length})
            </div>
            {step.children!.map((child, index) => (
              <div key={child.tool_call.id} className="mb-4 last:mb-0">
                <TimelineStep
                  step={child}
                  isLast={index === step.children!.length - 1}
                  onCancelTool={onCancelTool}
                  onApproveTool={onApproveTool}
                  onRejectTool={onRejectTool}
                  onRetryTool={onRetryTool}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ToolExecutionTimeline({
  workflow,
  onCancelTool,
  onApproveTool,
  onRejectTool,
  onRetryTool,
  className,
  compact = false,
}: ToolExecutionTimelineProps) {
  // Calculate overall progress
  const progress = useMemo(() => {
    const totalSteps = workflow.total_steps || workflow.steps.length;
    const completedSteps = workflow.current_step || 0;
    return (completedSteps / totalSteps) * 100;
  }, [workflow]);

  // Get status icon and color
  const getStatusDisplay = () => {
    switch (workflow.status) {
      case 'pending':
        return {
          icon: <Clock className="h-5 w-5" />,
          color: 'text-muted-foreground',
          label: 'Pending',
        };
      case 'in_progress':
        return {
          icon: <Loader2 className="h-5 w-5 animate-spin" />,
          color: 'text-blue-600 dark:text-blue-400',
          label: 'In Progress',
        };
      case 'completed':
        return {
          icon: <CheckCircle2 className="h-5 w-5" />,
          color: 'text-green-600 dark:text-green-400',
          label: 'Completed',
        };
      case 'failed':
        return {
          icon: <XCircle className="h-5 w-5" />,
          color: 'text-red-600 dark:text-red-400',
          label: 'Failed',
        };
      case 'cancelled':
        return {
          icon: <XCircle className="h-5 w-5" />,
          color: 'text-orange-600 dark:text-orange-400',
          label: 'Cancelled',
        };
      default:
        return {
          icon: <Clock className="h-5 w-5" />,
          color: 'text-muted-foreground',
          label: workflow.status,
        };
    }
  };

  const status = getStatusDisplay();

  // Format duration
  const formatDuration = (ms?: number): string => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div className={cn('border border-border rounded-lg overflow-hidden bg-background', className)}>
      {/* Workflow Header */}
      <div className="bg-muted/50 border-b border-border p-4">
        <div className="flex items-start gap-3 mb-3">
          <Target className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold mb-1">{workflow.description}</div>
            {workflow.goal_id && (
              <div className="text-xs text-muted-foreground font-mono">
                Goal ID: {workflow.goal_id}
              </div>
            )}
          </div>
          <div className={cn('flex items-center gap-2', status.color)}>
            {status.icon}
            <span className="text-sm font-semibold">{status.label}</span>
          </div>
        </div>

        {/* Progress Bar */}
        {workflow.status === 'in_progress' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Step {workflow.current_step} of {workflow.total_steps}
              </span>
              <span>{progress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              >
                <div className="h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
              </div>
            </div>
          </div>
        )}

        {/* Metadata */}
        {!compact && (
          <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
            <div>
              <span className="text-muted-foreground">Started:</span>
              <span className="ml-2 font-mono">
                {workflow.started_at
                  ? new Date(workflow.started_at).toLocaleTimeString()
                  : '-'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Duration:</span>
              <span className="ml-2 font-mono">
                {formatDuration(workflow.total_duration_ms)}
              </span>
            </div>
            {workflow.completed_at && (
              <div>
                <span className="text-muted-foreground">Completed:</span>
                <span className="ml-2 font-mono">
                  {new Date(workflow.completed_at).toLocaleTimeString()}
                </span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Total Steps:</span>
              <span className="ml-2 font-mono">{workflow.steps.length}</span>
            </div>
          </div>
        )}
      </div>

      {/* Timeline Steps */}
      <div className="p-4">
        {workflow.steps.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
            <AlertCircle className="h-8 w-8" />
            <div>No execution steps yet</div>
          </div>
        ) : (
          workflow.steps.map((step, index) => (
            <TimelineStep
              key={step.tool_call.id}
              step={step}
              isLast={index === workflow.steps.length - 1}
              onCancelTool={onCancelTool}
              onApproveTool={onApproveTool}
              onRejectTool={onRejectTool}
              onRetryTool={onRetryTool}
            />
          ))
        )}
      </div>
    </div>
  );
}
