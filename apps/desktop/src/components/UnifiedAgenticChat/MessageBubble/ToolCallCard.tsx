/**
 * ToolCallCard Component
 *
 * Renders a card displaying tool call status, with approval buttons
 * for actions requiring user approval.
 *
 * Refactored to use the shared ToolCalling component library.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { invoke, isTauri } from '../../../lib/tauri-mock';
import { respondToolConfirmation } from '../../../api/toolConfirmation';
import { SidecarMode } from '../../../stores/unifiedChatStore';
import { useSimpleModeStore } from '../../../stores/ui';
import { ToolCallCard as SharedToolCallCard } from '../../ToolCalling/ToolCallCard';
import { ToolCallUI } from '../../../types/toolCalling';

export interface ToolCallCardProps {
  messageId: string;
  toolName?: string;
  toolStatus?: string;
  toolCommand?: string;
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
  requiresApproval,
  actionId,
  confirmationRequestId,
  onToggleSidecar,
}) => {
  const isSimpleMode = useSimpleModeStore((state) => state.mode === 'simple');
  const [pendingAction, setPendingAction] = React.useState<'approve' | 'deny' | 'cancel' | null>(
    null,
  );
  const [actionError, setActionError] = React.useState<string | null>(null);

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
    if (!confirmationRequestId) {
      const message = 'Approval request is no longer available.';
      setActionError(message);
      toast.error(message);
      return;
    }

    if (!isTauri) {
      console.debug('[ToolCallCard] Mock approve confirmation:', confirmationRequestId);
      return;
    }

    setPendingAction('approve');
    setActionError(null);
    try {
      await respondToolConfirmation(confirmationRequestId, true);
      console.debug(`[ToolCallCard] Approved confirmation ${confirmationRequestId}`);
    } catch (error) {
      console.error('[ToolCallCard] Failed to approve confirmation:', error);
      const message = 'Failed to approve tool request.';
      setActionError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }, [confirmationRequestId]);

  const handleDeny = useCallback(async () => {
    if (!confirmationRequestId) {
      const message = 'Approval request is no longer available.';
      setActionError(message);
      toast.error(message);
      return;
    }

    if (!isTauri) {
      console.debug('[ToolCallCard] Mock deny confirmation:', confirmationRequestId);
      return;
    }

    setPendingAction('deny');
    setActionError(null);
    try {
      await respondToolConfirmation(confirmationRequestId, false);
      console.debug(`[ToolCallCard] Denied confirmation ${confirmationRequestId}`);
    } catch (error) {
      console.error('[ToolCallCard] Failed to deny confirmation:', error);
      const message = 'Failed to reject tool request.';
      setActionError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }, [confirmationRequestId]);

  const handleCancel = useCallback(async () => {
    if (!actionId) {
      const message = 'Live tool execution is no longer available.';
      setActionError(message);
      toast.error(message);
      return;
    }
    if (!isTauri) {
      console.debug('[ToolCallCard] Mock cancel tool:', actionId);
      return;
    }

    setPendingAction('cancel');
    setActionError(null);
    try {
      await invoke('cancel_tool_execution', { toolId: actionId });
      console.debug(`[ToolCallCard] Cancelled tool ${actionId}`);
    } catch (error) {
      console.error('[ToolCallCard] Failed to cancel tool:', error);
      const message = 'Failed to cancel tool execution.';
      setActionError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }, [actionId]);

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
      tool_id: actionId || 'unknown',
      tool_name: toolName || 'Unknown Tool',
      tool_description: toolCommand || '',
      parameters: {}, // We don't have structured params here easily without parsing toolCommand
      status,
      created_at: new Date().toISOString(),
      requires_approval: requiresApproval,
      // If we could parse duration from toolStatus string or similar, we would add it here
    };
  }, [actionId, messageId, toolName, toolCommand, toolStatus, requiresApproval]);

  return (
    <div className="w-full">
      <SharedToolCallCard
        toolCall={toolCall}
        onApprove={confirmationRequestId && pendingAction === null ? handleApprove : undefined}
        onReject={confirmationRequestId && pendingAction === null ? handleDeny : undefined}
        onCancel={actionId && pendingAction === null ? handleCancel : undefined}
        showParameters={!isSimpleMode}
        defaultExpanded={requiresApproval} // Expand by default if approval needed
        className="bg-black/20 border-white/5"
      />
      {(pendingAction || actionError || (requiresApproval && !confirmationRequestId)) && (
        <div className="mt-2 px-1 text-[11px]">
          {pendingAction && <p className="text-zinc-400">Waiting for {pendingAction}...</p>}
          {actionError && <p className="text-red-400">{actionError}</p>}
          {!actionError && requiresApproval && !confirmationRequestId && (
            <p className="text-amber-400">Approval request is no longer available.</p>
          )}
        </div>
      )}
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
            type="button"
            onClick={() => onToggleSidecar(targetTab as SidecarMode)}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
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
