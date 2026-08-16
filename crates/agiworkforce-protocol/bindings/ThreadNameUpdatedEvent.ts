import type { ThreadId } from './ThreadId';

export type ThreadNameUpdatedEvent = { thread_id: ThreadId; thread_name?: string };
