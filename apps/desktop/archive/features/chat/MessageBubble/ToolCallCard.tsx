/**
 * ToolCallCard Component
 *
 * Desktop adapter over the canonical @agiworkforce/unified-chat ToolCallCard.
 * Preserves this file's existing flat prop API (messageId, toolName,
 * toolStatus, ...) and its Tauri-IPC approve/deny/cancel transport — those
 * stay desktop-specific and are injected into the shared component as
 * callbacks. Rendering (bar, approval prompt, request/response sections,
 * icon-kind inference) is now owned by the package.
 *
 * Canonical ToolCallCard for desktop chat surface; consolidated from 3
 * implementations in R25 V7, then reconciled onto the shared package
 * component in the unified-chat/web/desktop renderer consolidation.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { invoke, isTauri } from '../../../lib/tauri-mock';
import { respondToolConfirmation } from '../../../api/toolConfirmation';
import { SidecarMode } from '../../../stores/unifiedChatStore';
import { useSimpleModeStore } from '../../../stores/ui';
import {
  ToolCallCard as PackageToolCallCard,
  type ToolCallStatus,
} from '@agiworkforce/unified-chat';

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

// ─── Status mapping ───────────────────────────────────────────────────────────

function toPackageStatus(toolStatus: string | undefined): ToolCallStatus {
  switch (toolStatus) {
    case 'success':
    case 'completed':
      return 'complete';
    case 'failure':
    case 'failed':
    case 'error':
      return 'error';
    case 'cancelled':
      return 'cancelled';
    case 'running':
    case 'executing':
      return 'running';
    default:
      return 'pending';
  }
}

// ─── Kind mapping ─────────────────────────────────────────────────────────────
// Left to the package's own name-based auto-inference (kind='auto' default) —
// this desktop wrapper always passes the raw tool name as the label, so a
// separate local classifier would just duplicate that inference.

// ─── Component ────────────────────────────────────────────────────────────────

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

  const displayLabel = toolName || 'Tool';
  const hasCommand = !isSimpleMode && Boolean(toolCommand);
  const hasStatusFeedback = Boolean(
    pendingAction || actionError || (requiresApproval && !confirmationRequestId),
  );

  // Extra status feedback (pending-action / error / expired-approval text) that
  // doesn't fit the package's generic approval-prompt + request/response body —
  // rendered as a footer below the bar, alongside the sidecar toggle link.
  const footer =
    hasStatusFeedback || onToggleSidecar ? (
      <div className="px-1">
        {pendingAction && (
          <p className="text-xs text-muted-foreground">Waiting for {pendingAction}...</p>
        )}
        {actionError && <p className="text-xs text-red-400">{actionError}</p>}
        {!actionError && requiresApproval && !confirmationRequestId && (
          <p className="text-xs text-amber-400">Approval request is no longer available.</p>
        )}
        {onToggleSidecar && (
          <div className="flex justify-end mt-1">
            <button
              type="button"
              onClick={() => onToggleSidecar(targetTab as SidecarMode)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Open in {targetTab} view
            </button>
          </div>
        )}
      </div>
    ) : undefined;

  return (
    <PackageToolCallCard
      id={actionId || messageId}
      name={displayLabel}
      status={toPackageStatus(toolStatus)}
      requiresApproval={requiresApproval && Boolean(confirmationRequestId || actionId)}
      commandText={hasCommand ? toolCommand : undefined}
      onApprove={confirmationRequestId ? handleApprove : undefined}
      onReject={confirmationRequestId ? handleDeny : undefined}
      onCancel={actionId ? handleCancel : undefined}
      showCopyAction={false}
      footer={footer}
    />
  );
};

ToolCallCardComponent.displayName = 'ToolCallCard';

export const ToolCallCard = memo(ToolCallCardComponent);
