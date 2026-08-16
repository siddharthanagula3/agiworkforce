import type { FileChange } from './FileChange';

export type ApplyPatchApprovalRequestEvent = {
  call_id: string;
  turn_id: string;
  changes: { [key in string]?: FileChange };
  reason: string | null;
  grant_root: string | null;
};
