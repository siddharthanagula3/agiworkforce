import type { AbsolutePathBuf } from './AbsolutePathBuf';

export type ImageGenerationEndEvent = {
  call_id: string;
  status: string;
  revised_prompt?: string;
  result: string;
  saved_path?: AbsolutePathBuf;
};
