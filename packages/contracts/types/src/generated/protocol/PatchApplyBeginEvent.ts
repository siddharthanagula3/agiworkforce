import type { FileChange } from './FileChange';

export type PatchApplyBeginEvent = {
  call_id: string;
  turn_id: string;
  auto_approved: boolean;
  changes: { [key in string]?: FileChange };
};
