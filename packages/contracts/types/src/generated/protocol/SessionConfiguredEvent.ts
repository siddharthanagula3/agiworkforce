import type { AbsolutePathBuf } from './AbsolutePathBuf';
import type { ApprovalsReviewer } from './ApprovalsReviewer';
import type { AskForApproval } from './AskForApproval';
import type { EventMsg } from './EventMsg';
import type { PermissionProfile } from './PermissionProfile';
import type { ReasoningEffort } from './ReasoningEffort';
import type { ServiceTier } from './ServiceTier';
import type { ThreadId } from './ThreadId';

export type SessionConfiguredEvent = {
  session_id: ThreadId;
  forked_from_id: ThreadId | null;
  thread_name?: string;
  model: string;
  model_provider_id: string;
  service_tier: ServiceTier | null;
  approval_policy: AskForApproval;
  /**
   * Configures who approval requests are routed to for review once they have
   * been escalated. This does not disable separate safety checks such as
   * ARC.
   */
  approvals_reviewer: ApprovalsReviewer;
  permission_profile: PermissionProfile;
  cwd: AbsolutePathBuf;
  reasoning_effort: ReasoningEffort | null;
  history_log_id: bigint;
  history_entry_count: number;
  initial_messages: Array<EventMsg> | null;
  rollout_path: string | null;
};
