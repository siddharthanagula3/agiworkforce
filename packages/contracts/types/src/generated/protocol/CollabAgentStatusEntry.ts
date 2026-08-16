import type { AgentStatus } from './AgentStatus';
import type { ThreadId } from './ThreadId';

export type CollabAgentStatusEntry = {
  thread_id: ThreadId;
  agent_nickname?: string | null;
  agent_role?: string | null;
  status: AgentStatus;
};
