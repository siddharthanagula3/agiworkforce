import type { CollabAgentRef } from './CollabAgentRef';
import type { ThreadId } from './ThreadId';

export type CollabWaitingBeginEvent = {
  sender_thread_id: ThreadId;
  receiver_thread_ids: Array<ThreadId>;
  receiver_agents?: Array<CollabAgentRef>;
  call_id: string;
};
