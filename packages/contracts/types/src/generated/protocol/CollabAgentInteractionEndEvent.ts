import type { AgentStatus } from './AgentStatus';
import type { ThreadId } from './ThreadId';

export type CollabAgentInteractionEndEvent = {
  call_id: string;
  sender_thread_id: ThreadId;
  receiver_thread_id: ThreadId;
  receiver_agent_nickname?: string | null;
  receiver_agent_role?: string | null;
  prompt: string;
  status: AgentStatus;
};
