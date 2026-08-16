import type { AgentStatus } from './AgentStatus';
import type { CollabAgentStatusEntry } from './CollabAgentStatusEntry';
import type { ThreadId } from './ThreadId';

export type CollabWaitingEndEvent = {
  sender_thread_id: ThreadId;
  call_id: string;
  agent_statuses?: Array<CollabAgentStatusEntry>;
  statuses: { [key in ThreadId]?: AgentStatus };
};
