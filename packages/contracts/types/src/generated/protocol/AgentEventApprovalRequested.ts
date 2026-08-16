import type { AgentEventApprovalRiskLevel } from './AgentEventApprovalRiskLevel';
import type { AgentEventToolCategory } from './AgentEventToolCategory';
import type { JsonValue } from './serde_json/JsonValue';

export type AgentEventApprovalRequested = {
  approvalId: string;
  toolCallId: string;
  name: string;
  category: AgentEventToolCategory;
  summary: string;
  input: JsonValue;
  riskLevel?: AgentEventApprovalRiskLevel;
};
