import type { AbsolutePathBuf } from './AbsolutePathBuf';
import type { AdditionalPermissionProfile } from './AdditionalPermissionProfile';
import type { ExecPolicyAmendment } from './ExecPolicyAmendment';
import type { NetworkApprovalContext } from './NetworkApprovalContext';
import type { NetworkPolicyAmendment } from './NetworkPolicyAmendment';
import type { ParsedCommand } from './ParsedCommand';
import type { ReviewDecision } from './ReviewDecision';

export type ExecApprovalRequestEvent = {
  call_id: string;
  approval_id?: string;
  turn_id: string;
  command: Array<string>;
  cwd: AbsolutePathBuf;
  reason: string | null;
  network_approval_context?: NetworkApprovalContext;
  proposed_execpolicy_amendment?: ExecPolicyAmendment;
  proposed_network_policy_amendments?: Array<NetworkPolicyAmendment>;
  additional_permissions?: AdditionalPermissionProfile;
  available_decisions?: Array<ReviewDecision>;
  parsed_cmd: Array<ParsedCommand>;
};
