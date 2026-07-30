import { useCallback } from 'react';
import { invoke } from '../lib/tauri-mock';
import { useToolStore, type ApprovalRequest } from '../stores/chat/toolStore';
import { respondToolConfirmation } from '../api/toolConfirmation';

interface ResolveOptions {
  trust?: boolean;
  reason?: string;
}

export function useApprovalActions() {
  const approveOperation = useToolStore((state) => state.approveOperation);
  const rejectOperation = useToolStore((state) => state.rejectOperation);
  const recordTrustedAction = useToolStore((state) => state.recordTrustedAction);

  const resolveApproval = useCallback(
    async (approval: ApprovalRequest, decision: 'approve' | 'reject', options?: ResolveOptions) => {
      // AUDIT-APPROVAL-046 fix: Use respond_tool_confirmation for MCP/tool confirmations
      // instead of agent_resolve_approval. The approval.type === 'mcp_tool' indicates
      // this came from tool:confirmation_required event which requires the tool confirmation
      // response channel, not the agent approval channel.
      if (approval.type === 'mcp_tool') {
        // For MCP/tool confirmations, use the tool confirmation response command
        const resolution = await respondToolConfirmation(
          approval.id,
          decision === 'approve',
          options?.trust ?? false,
          options?.reason,
          false,
          typeof approval.details['toolName'] === 'string'
            ? approval.details['toolName']
            : undefined,
        );

        if (decision === 'approve') {
          approveOperation(approval.id);
        } else {
          rejectOperation(approval.id, options?.reason);
        }
        return resolution;
      }

      // For agent-level approvals (non-MCP tools), use agent_resolve_approval
      await invoke('agent_resolve_approval', {
        approvalId: approval.id,
        decision,
        reason: options?.reason,
        trust: options?.trust ?? false,
      });

      if (decision === 'approve') {
        approveOperation(approval.id);
        if (options?.trust && approval.workflowHash && approval.actionSignature) {
          recordTrustedAction(approval.workflowHash, approval.actionSignature);
        }
      } else {
        rejectOperation(approval.id, options?.reason);
      }
      return undefined;
    },
    [approveOperation, recordTrustedAction, rejectOperation],
  );

  return { resolveApproval };
}
