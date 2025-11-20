import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUnifiedChatStore } from '../stores/unifiedChatStore';
import type { ApprovalRequest } from '../stores/unifiedChatStore';

interface ResolveOptions {
  trust?: boolean;
  reason?: string;
}

export function useApprovalActions() {
  const approveOperation = useUnifiedChatStore((state) => state.approveOperation);
  const rejectOperation = useUnifiedChatStore((state) => state.rejectOperation);
  const recordTrustedAction = useUnifiedChatStore((state) => state.recordTrustedAction);

  const resolveApproval = useCallback(
    async (approval: ApprovalRequest, decision: 'approve' | 'reject', options?: ResolveOptions) => {
      await invoke('agent_resolve_approval', {
        approval_id: approval.id,
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
    },
    [approveOperation, recordTrustedAction, rejectOperation],
  );

  return { resolveApproval };
}
