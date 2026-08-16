import type { ThreadSummary } from './ThreadSummary';

export type ThreadListResponse = { threads: Array<ThreadSummary>; nextCursor?: string };
