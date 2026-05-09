/**
 * `sendQueue` — surface-agnostic wrapper around `messageQueueManager` that
 * the chat hooks (`useChat`, mobile send pipeline, etc.) route every send
 * through. The queue is the single point of entry for any prompt destined
 * for the LLM runtime, and it provides:
 *
 *   - FIFO-within-priority ordering across `now > next > later` lanes
 *   - Cancellation via AbortSignal
 *   - Backpressure (lane cap) via `QueueFullError`
 *   - Persistence of `next` and `later` lanes across surface restart
 *
 * Each surface creates exactly one instance via `getSendQueue(surfaceId)`,
 * passing its own storage adapter. The queue does NOT share state across
 * surfaces — the desktop and web instances are independent (per Task 1.4
 * §"Cross-surface state").
 */

import {
  createMessageQueue,
  createWebStorageAdapter,
  type CreateMessageQueueOptions,
  type MessageQueue,
  type QueueStorageAdapter,
} from '@agiworkforce/runtime';

const queues = new Map<string, MessageQueue>();

export interface GetSendQueueOptions extends CreateMessageQueueOptions {
  /**
   * Override an existing queue for the given surfaceId. Useful for tests that
   * need a fresh queue between cases.
   */
  reset?: boolean;
}

/**
 * Return the per-surface message queue. The first call for a given
 * `surfaceId` creates the queue and caches it; subsequent calls return the
 * same instance.
 *
 * @param surfaceId — stable identifier for the calling surface
 *                    (`'desktop'`, `'web'`, `'mobile'`, `'extension'`,
 *                    `'extension-vscode'`).
 * @param options — optional `storage` adapter, lane cap override, logger.
 */
export function getSendQueue(surfaceId: string, options?: GetSendQueueOptions): MessageQueue {
  if (options?.reset) queues.delete(surfaceId);
  let queue = queues.get(surfaceId);
  if (!queue) {
    queue = createMessageQueue(options);
    queues.set(surfaceId, queue);
  }
  return queue;
}

/**
 * Default localStorage-backed storage adapter for browser-like surfaces
 * (web, desktop renderer, Chrome extension popup). Returns null when
 * `localStorage` is unavailable (SSR, locked storage), so the caller can
 * fall back to a volatile queue without branching.
 */
export function defaultBrowserStorage(surfaceId: string): QueueStorageAdapter | null {
  if (typeof globalThis === 'undefined') return null;
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  if (!storage) return null;
  return createWebStorageAdapter(`agiworkforce.queue.${surfaceId}`, storage);
}

/**
 * Convenience: enqueue a string prompt and immediately resolve with the
 * QueuedCommand. The caller is responsible for calling `dequeue()` (or
 * `dequeueIf` with the returned id) when ready to send to the LLM runtime.
 *
 * The mode defaults to `'prompt'` so it round-trips through `popAllEditable`
 * if the user pushes ESC mid-stream.
 */
export function enqueuePrompt(
  queue: MessageQueue,
  text: string,
  options?: {
    priority?: 'now' | 'next' | 'later';
    signal?: AbortSignal;
    isMeta?: boolean;
    skipSlashCommands?: boolean;
    origin?: { kind: string; [key: string]: unknown };
  },
): ReturnType<MessageQueue['enqueue']> {
  return queue.enqueue(
    {
      value: text,
      mode: 'prompt',
      priority: options?.priority,
      isMeta: options?.isMeta,
      skipSlashCommands: options?.skipSlashCommands,
      origin: options?.origin,
    },
    options?.signal ? { signal: options.signal } : undefined,
  );
}

/**
 * Reset all queue caches. Used by tests to ensure isolation between cases.
 * Production code should never call this.
 */
export function __resetAllSendQueuesForTests(): void {
  queues.clear();
}
