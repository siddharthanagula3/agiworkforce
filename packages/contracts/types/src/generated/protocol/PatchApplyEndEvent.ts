import type { FileChange } from './FileChange';
import type { PatchApplyStatus } from './PatchApplyStatus';

export type PatchApplyEndEvent = {
  call_id: string;
  turn_id: string;
  stdout: string;
  stderr: string;
  success: boolean;
  changes: { [key in string]?: FileChange };
  status: PatchApplyStatus;
};
