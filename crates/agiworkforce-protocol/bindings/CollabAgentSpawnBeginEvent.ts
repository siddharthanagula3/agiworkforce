import type { ReasoningEffort } from './ReasoningEffort';
import type { ThreadId } from './ThreadId';

export type CollabAgentSpawnBeginEvent = {
  call_id: string;
  sender_thread_id: ThreadId;
  prompt: string;
  model: string;
  reasoning_effort: ReasoningEffort;
};
