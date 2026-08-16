import type { DeveloperMessage } from './DeveloperMessage';
import type { ThreadSummary } from './ThreadSummary';

export type ThreadReadResponse = {
  thread: ThreadSummary;
  messages: Array<DeveloperMessage>;
  transcriptTruncated: boolean;
};
