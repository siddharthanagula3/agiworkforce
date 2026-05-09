/**
 * @agiworkforce/runtime/queue
 *
 * Per-surface priority send pipeline. See `messageQueueManager.ts` for the
 * factory + design rationale, `types.ts` for the public surface.
 *
 * Usage:
 * ```ts
 * import { createMessageQueue, createWebStorageAdapter } from '@agiworkforce/runtime';
 *
 * const queue = createMessageQueue({
 *   storage: createWebStorageAdapter('agi.queue.web', window.localStorage),
 * });
 *
 * queue.enqueue({ value: 'hello', mode: 'prompt' });
 * const cmd = queue.dequeue();
 * ```
 */

export {
  createMessageQueue,
  createWebStorageAdapter,
  createKvStorageAdapter,
  type CreateMessageQueueOptions,
  type SyncKvStore,
} from './messageQueueManager';

export { LANE_CAP, PRIORITY_ORDER, QueueDequeueRaceError, QueueFullError } from './types';

export type {
  ContentBlock,
  EditablePromptInputMode,
  MessageQueue,
  PastedContent,
  PopAllEditableResult,
  PromptInputMode,
  QueueListener,
  QueuePriority,
  QueueStorageAdapter,
  QueuedCommand,
} from './types';
