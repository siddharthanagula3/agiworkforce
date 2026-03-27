/**
 * ToolCallCard Component
 *
 * Renders a card displaying tool call status, with approval buttons
 * for actions requiring user approval.
 *
 * Refactored to use the shared ToolCalling component library.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { invoke, isTauri } from '@/lib/tauri-mock';
import { respondToolConfirmation } from '../../../api/toolConfirmation';
import { SidecarMode } from '@/stores/unified/unifiedChatStore';
import { useSimpleModeStore } from '@/stores/unified/ui';
import { ToolCallCard as SharedToolCallCard } from '../../ToolCalling/ToolCallCard';
import { ToolCallUI } from '@/types/toolCalling';

export interface ToolCallCardProps {
  messageId: string;
  toolName?: string;
  toolStatus?: string;
  toolCommand?: string;
  toolParameters?: Record<string, unknown>;
  toolError?: string;
  toolStartedAt?: string;
  toolCompletedAt?: string;
  toolDurationMs?: number;
  createdAt?: string;
  requiresApproval: boolean;
  actionId?: string;
  confirmationRequestId?: string; // AUDIT-UI-052: ID for tool confirmation requests
  onToggleSidecar?: (tab: SidecarMode) => void;
}

const ToolCallCardComponent: React.FC<ToolCallCardProps> = ({
  messageId,
  toolName,
  toolStatus,
  toolCommand,
  toolParameters,
  toolError,
  toolStartedAt,
  toolCompletedAt,
  toolDurationMs,
  createdAt,
  requiresApproval,
  actionId,
  confirmationRequestId,
  onToggleSidecar,
}) => {
  const isSimpleMode = useSimpleModeStore((state) => state.mode === 'simple');

  // Determine target sidecar tab based on tool name
  const targetTab = useMemo(() => {
    const lowerTool = (toolName || '').toString().toLowerCase();
    return lowerTool.includes('browser')
      ? 'browser'
      : lowerTool.includes('file') || lowerTool.includes('read') || lowerTool.includes('edit')
        ? 'code'
        : lowerTool.includes('image') || lowerTool.includes('video') || lowerTool.includes('media')
          ? 'preview'
          : lowerTool.includes('code')
            ? 'code'
            : 'terminal';
  }, [toolName]);

  // AUDIT-UI-052 fix: Use proper tool confirmation response command
  const handleApprove = useCallback(async () => {
    // If we have a confirmation request ID, use the tool confirmation response
    if (confirmationRequestId) {
      if (!isTauri) {
        return;
      }
      try {
        await respondToolConfirmation(confirmationRequestId, true);
      } catch (error) {
        console.error('[ToolCallCard] Failed to approve confirmation:', error);
      }
    } else {
      // Fallback: Try to cancel the tool execution (for non-confirmation cases)
      const toolCallId = actionId || messageId;
      if (isTauri) {
        try {
          await invoke('cancel_tool_execution', { tool_call_id: toolCallId });
        } catch (error) {
          console.error('[ToolCallCard] Failed to resume tool:', error);
        }
      }
    }
  }, [confirmationRequestId, actionId, messageId]);

  const handleDeny = useCallback(async () => {
    // If we have a confirmation request ID, use the tool confirmation response
    if (confirmationRequestId) {
      if (!isTauri) {
        return;
      }
      try {
        await respondToolConfirmation(confirmationRequestId, false);
      } catch (error) {
        console.error('[ToolCallCard] Failed to deny confirmation:', error);
      }
    } else {
      // Fallback: Try to cancel the tool execution (for non-confirmation cases)
      const toolCallId = actionId || messageId;
      if (isTauri) {
        try {
          await invoke('cancel_tool_execution', { tool_call_id: toolCallId });
        } catch (error) {
          console.error('[ToolCallCard] Failed to cancel tool:', error);
        }
      }
    }
  }, [confirmationRequestId, actionId, messageId]);

  const handleCancel = useCallback(async () => {
    // Cancel tool execution
    const toolCallId = actionId || messageId;
    if (!isTauri) {
      return;
    }
    try {
      await invoke('cancel_tool_execution', { tool_call_id: toolCallId });
    } catch (error) {
      console.error('[ToolCallCard] Failed to cancel tool:', error);
    }
  }, [actionId, messageId]);

  // Construct ToolCallUI object from props
  const toolCall: ToolCallUI = useMemo(() => {
    // Determine status
    let status: ToolCallUI['status'] = 'in_progress';
    if (requiresApproval) status = 'awaiting_approval';
    else if (toolStatus === 'success' || toolStatus === 'completed') status = 'completed';
    else if (toolStatus === 'failure' || toolStatus === 'failed' || toolStatus === 'error')
      status = 'failed';
    else if (toolStatus === 'cancelled') status = 'cancelled';
    else if (toolStatus === 'running' || toolStatus === 'executing') status = 'in_progress';
    else status = (toolStatus as ToolCallUI['status']) || 'pending';

    return {
      id: actionId || messageId, // Use actionId if avail, fallback to messageId
      type: 'tool_use',
      name: toolName || 'Unknown Tool',
      tool_id: toolName || actionId || 'unknown',
      tool_name: toolName || 'Unknown Tool',
      tool_description: toolCommand || '',
      parameters: toolParameters || {},
      status,
      error: toolError,
      created_at: createdAt || new Date().toISOString(),
      started_at: toolStartedAt,
      completed_at: toolCompletedAt,
      duration_ms: toolDurationMs,
      requires_approval: requiresApproval,
      // If we could parse duration from toolStatus string or similar, we would add it here
    };
  }, [
    actionId,
    messageId,
    toolName,
    toolCommand,
    toolParameters,
    toolStatus,
    toolError,
    toolStartedAt,
    toolCompletedAt,
    toolDurationMs,
    createdAt,
    requiresApproval,
  ]);

  return (
    <div className="w-full">
      <SharedToolCallCard
        toolCall={toolCall}
        onApprove={handleApprove}
        onReject={handleDeny}
        onCancel={handleCancel}
        showParameters={!isSimpleMode}
        defaultExpanded={requiresApproval} // Expand by default if approval needed
        className="bg-black/20 border-white/5"
      />
      {/* 
         In the original, there was a "View Output" button that toggled sidecar.
         The SharedToolCallCard doesn't have that specific slot, but we can wrap it or add it below.
         However, the SharedToolCallCard header is clickable to expand.
         Let's add a small footer if we want that specific action, or relying on Sidecar's auto-open logic.
         For now, to strictly resolve gaps, we rely on the card.
         But the user might miss the "View Output" button.
         Let's add a small link if sidecar toggle is available.
      */}
      {onToggleSidecar && (
        <div className="flex justify-end mt-1 px-1">
          <button
            onClick={() => onToggleSidecar(targetTab as SidecarMode)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Open in {targetTab} view
          </button>
        </div>
      )}
    </div>
  );
};

ToolCallCardComponent.displayName = 'ToolCallCard';

export const ToolCallCard = memo(ToolCallCardComponent);
