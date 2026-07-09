/**
 * ToolCallCard — web adapter over the canonical @agiworkforce/unified-chat
 * ToolCallCard. Preserves this file's existing `ToolCall` object-shaped API
 * (used by ToolTimeline.tsx) while delegating all rendering to the shared
 * package component. Approve/reject/cancel stay callback props here — web
 * has no built-in transport of its own to inject, callers wire their own.
 */

import { ToolCallCard as PackageToolCallCard, detectCodeBlock } from '@agiworkforce/unified-chat';

export { detectCodeBlock };

export type ToolCallStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'error'
  | 'awaiting_approval'
  | 'cancelled';

export interface ToolCall {
  id: string;
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  result?: string;
  status: ToolCallStatus;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  requiresApproval?: boolean;
  approved?: boolean;
  approvedAt?: string;
  defaultExpanded?: boolean;
}

interface ToolCallCardProps {
  toolCall: ToolCall;
  onCancel?: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  showParameters?: boolean;
  className?: string;
}

export function ToolCallCard({
  toolCall,
  onCancel,
  onApprove,
  onReject,
  showParameters = true,
  className,
}: ToolCallCardProps) {
  return (
    <PackageToolCallCard
      id={toolCall.id}
      name={toolCall.name}
      status={toolCall.status}
      requiresApproval={toolCall.requiresApproval}
      args={toolCall.parameters}
      result={toolCall.result}
      showParameters={showParameters}
      elapsedMs={toolCall.durationMs}
      onApprove={onApprove}
      onReject={onReject}
      onCancel={onCancel}
      className={className}
    />
  );
}
