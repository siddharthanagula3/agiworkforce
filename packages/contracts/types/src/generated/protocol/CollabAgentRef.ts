import type { ThreadId } from './ThreadId';

export type CollabAgentRef = {
  thread_id: ThreadId;
  agent_nickname?: string | null;
  agent_role?: string | null;
};
