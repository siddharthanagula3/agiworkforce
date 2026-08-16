import type { AgentEventApprovalDecision } from './AgentEventApprovalDecision';

export type AgentEventApprovalResolved = {
  approvalId: string;
  decision: AgentEventApprovalDecision;
};
