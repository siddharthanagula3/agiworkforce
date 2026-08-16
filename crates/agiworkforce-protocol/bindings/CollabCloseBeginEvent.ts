import type { ThreadId } from './ThreadId';

export type CollabCloseBeginEvent = {
  call_id: string;
  sender_thread_id: ThreadId;
  receiver_thread_id: ThreadId;
};
