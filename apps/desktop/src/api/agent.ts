import { invoke } from '../lib/tauri-mock';

export type ApprovalDecision = 'approve' | 'reject';

export async function resolveApproval(
  approvalId: string,
  decision: ApprovalDecision,
  options?: { reason?: string },
): Promise<void> {
  return invoke<void>('agent_resolve_approval', {
    approvalId,
    decision,
    reason: options?.reason,
  });
}
