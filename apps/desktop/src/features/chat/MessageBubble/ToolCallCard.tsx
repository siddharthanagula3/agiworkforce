/**
 * ToolCallCard Component
 *
 * Renders an inline tool-call bar using @agiworkforce/unified-chat InlineToolCall
 * in badge mode (Claude-parity round badge + "Result" sub-label).
 *
 * Approval/IPC logic (approve, deny, cancel) is kept intact inside the expanded
 * body ReactNode so it renders inside the collapsible section.
 *
 * Canonical ToolCallCard for desktop chat surface; consolidated from 3 implementations in R25 V7.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { AlertCircle, Play, X as XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { invoke, isTauri } from '../../../lib/tauri-mock';
import { respondToolConfirmation } from '../../../api/toolConfirmation';
import { SidecarMode } from '../../../stores/unifiedChatStore';
import { useSimpleModeStore } from '../../../stores/ui';
import {
  InlineToolCall,
  type InlineToolKind,
  type InlineToolCallStatus,
} from '@agiworkforce/unified-chat';
import { cn } from '../../../lib/utils';

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

function toInlineStatus(
  toolStatus: string | undefined,
  requiresApproval: boolean,
): InlineToolCallStatus {
  if (requiresApproval) return 'running'; // show spinner while awaiting approval
  switch (toolStatus) {
    case 'success':
    case 'completed':
      return 'success';
    case 'failure':
    case 'failed':
    case 'error':
      return 'error';
    case 'cancelled':
      return 'partial';
    case 'running':
    case 'executing':
      return 'running';
    default:
      return 'pending';
  }
}

// ─── Kind mapping ─────────────────────────────────────────────────────────────

function toInlineKind(toolName: string | undefined): InlineToolKind {
  const n = (toolName ?? '').toLowerCase();
  if (n.startsWith('mcp__') || n.startsWith('mcp_')) return 'mcp-custom';
  if (n.includes('browser') || n.includes('click') || n.includes('screenshot')) return 'browser';
  if (n.includes('bash') || n.includes('shell') || n.includes('exec') || n.includes('terminal'))
    return 'bash';
  if (n.includes('search') && !n.includes('fetch')) return 'web-search';
  if (n.includes('fetch') || n.includes('http')) return 'web-fetch';
  if (n.includes('image') || n.includes('imagegen')) return 'image-gen';
  if (n.includes('edit') || n.includes('patch')) return 'edit';
  if (n.includes('write') || n.includes('create')) return 'write';
  if (n.includes('read') || n.includes('view') || n.includes('file')) return 'read';
  if (n.includes('list') || n.includes('directory') || n.includes('folder')) return 'fs-list';
  return 'unknown';
}

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

  const inlineStatus = toInlineStatus(toolStatus, requiresApproval);
  const inlineKind = toInlineKind(toolName);
  const displayLabel = toolName || 'Tool';

  // Build body: approval prompt + request (toolCommand) + status feedback
  const body = useMemo(() => {
    const hasApprovalPrompt = requiresApproval && (confirmationRequestId || actionId);
    const hasCommand = !isSimpleMode && Boolean(toolCommand);
    const hasStatusFeedback = Boolean(
      pendingAction || actionError || (requiresApproval && !confirmationRequestId),
    );

    if (!hasApprovalPrompt && !hasCommand && !hasStatusFeedback) return undefined;

    return (
      <div className="space-y-2">
        {/* Approval prompt */}
        {requiresApproval && (confirmationRequestId || actionId) && (
          <div className="flex items-center gap-2 p-2 rounded bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900">
            <AlertCircle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
            <p className="flex-1 text-xs text-yellow-900 dark:text-yellow-100">
              This tool requires approval before execution.
            </p>
            <div className="flex gap-1.5">
              {confirmationRequestId && pendingAction === null && (
                <button
                  type="button"
                  onClick={handleApprove}
                  className="flex items-center gap-1 h-6 px-2 text-xs font-medium rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
                >
                  <Play className="h-2.5 w-2.5" />
                  Approve
                </button>
              )}
              {confirmationRequestId && pendingAction === null && (
                <button
                  type="button"
                  onClick={handleDeny}
                  className="h-6 px-2 text-xs font-medium rounded border border-border bg-background hover:bg-muted transition-colors"
                >
                  Reject
                </button>
              )}
              {actionId && pendingAction === null && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Cancel"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tool command / description */}
        {hasCommand && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
              Request
            </p>
            <pre className="font-mono text-[10px] leading-snug p-2 rounded bg-black/20 border border-white/8 overflow-x-auto max-h-48 overflow-y-auto select-text">
              {toolCommand}
            </pre>
          </div>
        )}

        {/* Action feedback */}
        {pendingAction && (
          <p className="text-xs text-muted-foreground">Waiting for {pendingAction}...</p>
        )}
        {actionError && <p className="text-xs text-red-400">{actionError}</p>}
        {!actionError && requiresApproval && !confirmationRequestId && (
          <p className="text-xs text-amber-400">Approval request is no longer available.</p>
        )}
      </div>
    );
  }, [
    requiresApproval,
    confirmationRequestId,
    actionId,
    isSimpleMode,
    toolCommand,
    pendingAction,
    actionError,
    handleApprove,
    handleDeny,
    handleCancel,
  ]);

  return (
    <div className="w-full">
      <InlineToolCall
        id={actionId || messageId}
        label={displayLabel}
        status={inlineStatus}
        kind={inlineKind}
        iconStyle="badge"
        body={body}
        defaultOpen={requiresApproval}
        className={cn(
          requiresApproval &&
            'rounded-lg border border-yellow-300/40 dark:border-yellow-700/40 bg-yellow-50/30 dark:bg-yellow-950/10 px-1',
        )}
      />

      {/* Sidecar toggle link */}
      {onToggleSidecar && (
        <div className="flex justify-end mt-1 px-1">
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
  );
};

ToolCallCardComponent.displayName = 'ToolCallCard';

export const ToolCallCard = memo(ToolCallCardComponent);
