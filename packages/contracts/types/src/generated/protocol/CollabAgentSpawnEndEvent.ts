import type { AgentStatus } from './AgentStatus';
import type { ReasoningEffort } from './ReasoningEffort';
import type { ThreadId } from './ThreadId';

export type CollabAgentSpawnEndEvent = {
  call_id: string;
  sender_thread_id: ThreadId;
  new_thread_id: ThreadId | null;
  new_agent_nickname?: string | null;
  new_agent_role?: string | null;
  prompt: string;
  model: string;
  reasoning_effort: ReasoningEffort;
  status: AgentStatus;
};
