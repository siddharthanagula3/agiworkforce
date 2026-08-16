import type { AbsolutePathBuf } from './AbsolutePathBuf';

export type ViewImageToolCallEvent = {
  call_id: string;
  path: AbsolutePathBuf;
};
