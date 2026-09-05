import type { ToolApprovalRequest } from '@agiworkforce/types';

const REASON_COPY: Record<ToolApprovalRequest['reason'], string> = {
  blocked_by_user_permission: 'Your automation permissions block this action.',
  always_allow: 'You have allowed this action.',
  user_requires_approval: 'This action needs your approval before it runs.',
  manual_approval_mode: 'Manual approval is on, so every action is confirmed first.',
  auto_approval_mode: 'Approval is automatic for actions at this risk level.',
  account_default_read_only: 'This account may only read, so the action was refused.',
  lethal_trifecta: 'Content on screen tried to steer this action, so it was refused.',
  never_rememberable: 'This action always asks fresh and cannot be remembered.',
  risk_tier: 'The safety layer rated this action too risky to run unattended.',
  policy_hard_block: 'This target is always blocked and no approval can unblock it.',
  harness_limit: 'The action went past a safety limit, so it was refused.',
};

const RISK_COPY: Record<ToolApprovalRequest['riskLevel'], string> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
};

export function describeApprovalReason(approval: ToolApprovalRequest): string {
  return REASON_COPY[approval.reason];
}

export function describeApprovalRisk(approval: ToolApprovalRequest): string {
  return RISK_COPY[approval.riskLevel];
}

export function isApprovalAnswerable(approval: ToolApprovalRequest): boolean {
  return approval.reason === 'user_requires_approval';
}
