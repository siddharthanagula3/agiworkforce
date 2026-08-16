
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
  error?: string;
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
  expired?: boolean;
  onResend?: (id: string) => void;
  showParameters?: boolean;
  className?: string;
}

export function ToolCallCard({
  toolCall,
  onCancel,
  onApprove,
  onReject,
  expired,
  onResend,
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
      error={toolCall.error}
      showParameters={showParameters}
      elapsedMs={toolCall.durationMs}
      onApprove={onApprove}
      onReject={onReject}
      onCancel={onCancel}
      expired={expired}
      onResend={onResend}
      className={className}
    />
  );
}
