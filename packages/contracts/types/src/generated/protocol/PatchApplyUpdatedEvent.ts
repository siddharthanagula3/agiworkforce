import type { FileChange } from './FileChange';

export type PatchApplyUpdatedEvent = {
  call_id: string;
  changes: { [key in string]?: FileChange };
};
