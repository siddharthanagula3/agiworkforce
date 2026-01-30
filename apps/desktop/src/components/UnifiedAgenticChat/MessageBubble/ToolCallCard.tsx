/**
 * ToolCallCard Component
 *
 * Renders a card displaying tool call status, with approval buttons
 * for actions requiring user approval.
 */

import React, { memo, useState, useCallback } from 'react';
import {
  CheckCircle2,
  FileText,
  Globe2,
  Image,
  Loader2,
  Terminal as TerminalIcon,
} from 'lucide-react';
import { emit, isTauri } from '../../../lib/tauri-mock';
import { getToolDisplayInfo } from '../../../lib/toolDisplayNames';
import { SidecarMode } from '../../../stores/unifiedChatStore';
import { useSimpleModeStore } from '../../../stores/ui';
import { ApprovalState } from './types';

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
  const [approvalState, setApprovalState] = useState<ApprovalState>('idle');
  const isSimpleMode = useSimpleModeStore((state) => state.mode === 'simple');

  const isExecuting = toolStatus === 'running' || toolStatus === 'executing';
  const isCompleted = toolStatus === 'success' || toolStatus === 'completed';

  // Get user-friendly tool display info for simple mode
  const toolDisplayInfo = getToolDisplayInfo(toolName);
  const displayToolName = isSimpleMode ? toolDisplayInfo.displayName : toolName || 'Tool call';
  const displayStatus = isSimpleMode
    ? isCompleted
      ? toolDisplayInfo.completedForm
      : isExecuting
        ? toolDisplayInfo.activeForm
        : 'Working...'
    : toolStatus || 'running';

  // Determine target sidecar tab based on tool name
  const lowerTool = (toolName || '').toString().toLowerCase();
  const targetTab: SidecarMode = lowerTool.includes('browser')
    ? 'browser'
    : lowerTool.includes('file') || lowerTool.includes('read') || lowerTool.includes('edit')
      ? 'code'
      : lowerTool.includes('image') || lowerTool.includes('video') || lowerTool.includes('media')
        ? 'preview'
        : lowerTool.includes('code')
          ? 'code'
          : 'terminal';

  const icon =
    targetTab === 'browser' ? (
      <Globe2 className="h-4 w-4" />
    ) : targetTab === 'code' ? (
      <FileText className="h-4 w-4" />
    ) : targetTab === 'preview' ? (
      <Image className="h-4 w-4" />
    ) : (
      <TerminalIcon className="h-4 w-4" />
    );

  const statusIcon =
    isCompleted || approvalState === 'approved' ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
    ) : isExecuting ? (
      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
    ) : (
      <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
    );

  const statusLabel =
    approvalState === 'approving'
      ? 'approving'
      : approvalState === 'denying'
        ? 'denying'
        : approvalState === 'approved'
          ? 'approved'
          : approvalState === 'denied'
            ? 'denied'
            : toolStatus || 'running';

  const cardClasses = requiresApproval
    ? 'rounded-2xl border border-amber-500/60 bg-amber-500/5 px-4 py-3 shadow-lg shadow-black/30'
    : 'rounded-2xl border border-white/5 bg-black/60 px-4 py-3 shadow-lg shadow-black/30';

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
    try {
      setApprovalState('approving');
      await emitAction('resume_agent');
      setApprovalState('approved');
    } catch (error) {
      console.error('[ToolCallCard] Failed to approve action', error);
      setApprovalState('idle');
    }
  }, [emitAction]);

  const handleDeny = useCallback(async () => {
    try {
      setApprovalState('denying');
      await emitAction('cancel_action');
      setApprovalState('denied');
    } catch (error) {
      console.error('[ToolCallCard] Failed to deny action', error);
      setApprovalState('idle');
    }
  }, [emitAction]);

  return (
    <div className={cardClasses}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-zinc-100">
          {icon}
          <span className="font-semibold">{displayToolName}</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/5 px-2 py-0.5 text-[11px] text-zinc-300">
            {statusIcon}
            <span className={isSimpleMode ? '' : 'capitalize'}>
              {isSimpleMode ? displayStatus : statusLabel}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleSidecar?.(targetTab)}
            className="rounded-lg border border-white/5 px-3 py-1 text-xs font-semibold text-zinc-100 hover:border-zinc-500"
          >
            View Output
          </button>
          {requiresApproval && (
            <>
              <button
                type="button"
                onClick={() => void handleApprove()}
                disabled={approvalState === 'approving' || approvalState === 'approved'}
                className="rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100 transition hover:border-emerald-500/80 disabled:opacity-60"
              >
                {approvalState === 'approving'
                  ? 'Approving...'
                  : approvalState === 'approved'
                    ? 'Approved'
                    : 'Approve'}
              </button>
              <button
                type="button"
                onClick={() => void handleDeny()}
                disabled={approvalState === 'denying' || approvalState === 'denied'}
                className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-100 transition hover:border-red-500/80 disabled:opacity-60"
              >
                {approvalState === 'denying'
                  ? 'Denying...'
                  : approvalState === 'denied'
                    ? 'Denied'
                    : 'Deny'}
              </button>
            </>
          )}
        </div>
      </div>
      {/* Hide raw command in simple mode - only show for advanced users */}
      {!isSimpleMode && (
        <p className="mt-2 truncate text-sm text-zinc-300" title={toolCommand}>
          {toolCommand}
        </p>
      )}
    </div>
  );
};

ToolCallCardComponent.displayName = 'ToolCallCard';

export const ToolCallCard = memo(ToolCallCardComponent);
