/**
 * ToolCallCard Component
 *
 * Renders a card displaying tool call status, with approval buttons
 * for actions requiring user approval.
 *
 * Refactored to use the shared ToolCalling component library.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { emit, isTauri } from '../../../lib/tauri-mock';
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
  onToggleSidecar?: (tab: SidecarMode) => void;
}

const ToolCallCardComponent: React.FC<ToolCallCardProps> = ({
  messageId,
  toolName,
  toolStatus,
  toolCommand,
  requiresApproval,
  actionId,
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

  const emitAction = useCallback(
    async (eventName: string) => {
      if (!isTauri) {
        console.log(`[ToolCallCard] Emit ${eventName}`, {
          actionId,
          toolName,
          messageId,
        });
        return;
      }
      await emit(eventName, { actionId, tool: toolName, messageId });
    },
    [actionId, toolName, messageId],
  );

  const handleApprove = useCallback(async () => {
    await emitAction('resume_agent');
  }, [emitAction]);

  const handleDeny = useCallback(async () => {
    await emitAction('cancel_action');
  }, [emitAction]);

  const handleCancel = useCallback(async () => {
    await emitAction('cancel_action');
  }, [emitAction]);

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
