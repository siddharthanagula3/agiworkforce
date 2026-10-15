import { invoke, isTauri } from '../lib/tauri-mock';

export type ApprovalDecision = 'approve' | 'reject';

export async function resolveApproval(
  approvalId: string,
  decision: ApprovalDecision,
  options?: { reason?: string },
): Promise<void> {
  if (!isTauri) {
    console.debug('[agent] resolveApproval (mock)', { approvalId, decision });
    return;
  }

  return invoke<void>('agent_resolve_approval', {
    approvalId,
    decision,
    reason: options?.reason,
  });
}
