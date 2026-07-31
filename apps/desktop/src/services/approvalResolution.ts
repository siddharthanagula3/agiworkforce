import type { ToolConfirmationResolution } from '../api/toolConfirmation';
import { resolveApproval as resolveAgentApproval } from '../api/agent';
import { respondToolConfirmation } from '../api/toolConfirmation';
import { type ApprovalRequest, useToolStore } from '../stores/chat/toolStore';

export interface ApprovalResolutionOptions {
  trust?: boolean;
  reason?: string;
}

/**
 * Resolve a Desktop approval through its authoritative native channel before
 * removing it from the local queue. Shared by Desktop approval surfaces and
 * the authenticated Mobile companion control runtime.
 */
export async function resolveApprovalRequest(
  approval: ApprovalRequest,
  decision: 'approve' | 'reject',
  options?: ApprovalResolutionOptions,
): Promise<ToolConfirmationResolution | undefined> {
  const { approveOperation, rejectOperation, recordTrustedAction } = useToolStore.getState();

  if (approval.type === 'mcp_tool') {
    const resolution = await respondToolConfirmation(
      approval.id,
      decision === 'approve',
      options?.trust ?? false,
      options?.reason,
      false,
      typeof approval.details['toolName'] === 'string' ? approval.details['toolName'] : undefined,
    );

    if (decision === 'approve') {
      approveOperation(approval.id);
    } else {
      rejectOperation(approval.id, options?.reason);
    }
    return resolution;
  }

  await resolveAgentApproval(approval.id, decision, {
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
}
