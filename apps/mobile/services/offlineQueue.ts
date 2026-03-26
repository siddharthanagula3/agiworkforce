/**
 * Offline message queue for the mobile app.
 *
 * When a message send fails due to a network error (not a streaming content
 * error), the message is pushed into this queue. When connectivity is restored,
 * processQueue() drains the queue in FIFO order, retrying each entry through
 * the provided sendFn callback.
 *
 * **Persistence:** The queue is backed by MMKV storage so it survives app
 * kills. On cold start, `restoreFromStorage()` rehydrates persisted entries
 * (without callbacks — those must be re-wired by the caller if needed).
 *
 * Retry behaviour:
 *  - Exponential backoff between retries: 1s, 2s, 4s (capped at MAX_BACKOFF_MS)
 *  - Each entry has onSuccess / onFailure callbacks that fire reliably after
 *    the attempt resolves, regardless of whether processQueue() is awaited.
 *  - Entries exceeding MAX_RETRY_COUNT are dropped and onFailure is called.
 */

import { storage } from '@/lib/mmkv';

export interface QueuedMessage {
  /** Unique queue entry ID (distinct from the chat message ID) */
  id: string;
  /** ID of the conversation this message belongs to */
  conversationId: string;
  /** Text content of the user message */
  content: string;
  /** Model ID to use when retrying */
  model: string;
  /** ISO timestamp of when the message was enqueued */
  queuedAt: string;
  /** Number of times this entry has been attempted */
  retryCount: number;
  /** Called after a successful send */
  onSuccess?: () => void;
  /** Called after the entry is dropped (max retries exceeded or permanent error) */
  onFailure?: (error: Error) => void;
}

/** Maximum retry attempts per queued message before it is dropped */
const MAX_RETRY_COUNT = 3;

/** Maximum number of messages that may be held in the queue at once */
const MAX_QUEUE_SIZE = 100;

/** Base delay for exponential backoff (ms) */
const BASE_BACKOFF_MS = 1_000;

/** Maximum backoff delay cap (ms) */
const MAX_BACKOFF_MS = 8_000;

/** MMKV key for persisted queue data */
const QUEUE_STORAGE_KEY = 'offline_queue_v1';

/** Serializable subset of QueuedMessage (excludes function callbacks). */
interface PersistedQueueEntry {
  id: string;
  conversationId: string;
  content: string;
  model: string;
  queuedAt: string;
  retryCount: number;
}

/** Compute backoff delay for a given retry count (0-based). */
function backoffDelay(retryCount: number): number {
  return Math.min(BASE_BACKOFF_MS * Math.pow(2, retryCount), MAX_BACKOFF_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class OfflineMessageQueue {
  private queue: QueuedMessage[] = [];
  private _isProcessing: boolean = false;

  /** Persist the current queue to MMKV (message data only, no callbacks). */
  private persistToStorage(): void {
    try {
      const entries: PersistedQueueEntry[] = this.queue.map(
        ({ id, conversationId, content, model, queuedAt, retryCount }) => ({
          id,
          conversationId,
          content,
          model,
          queuedAt,
          retryCount,
        }),
      );
      storage.set(QUEUE_STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Non-fatal — queue will be in-memory only
    }
  }

  /**
   * Restore queued messages from MMKV after app restart.
   * Callbacks are NOT restored (they are ephemeral function refs).
   */
  restoreFromStorage(): void {
    try {
      const raw = storage.getString(QUEUE_STORAGE_KEY);
      if (!raw) return;
      const entries = JSON.parse(raw) as PersistedQueueEntry[];
      if (!Array.isArray(entries)) return;
      // Only restore entries that aren't already in the queue (idempotent)
      for (const entry of entries) {
        if (!this.queue.some((q) => q.id === entry.id)) {
          this.queue.push(entry);
        }
      }
    } catch {
      // Corrupted data — start fresh
      storage.delete(QUEUE_STORAGE_KEY);
    }
  }

  /**
   * Add a message to the end of the queue.
   * Ignores duplicates by conversationId + content to prevent double-queuing
   * the same message on rapid reconnect cycles.
   *
   * @param onSuccess - Called after the message is successfully sent.
   * @param onFailure - Called if the message is dropped after exhausting retries.
   */
  enqueue(
    msg: Omit<QueuedMessage, 'id' | 'queuedAt' | 'retryCount' | 'onSuccess' | 'onFailure'>,
    callbacks?: { onSuccess?: () => void; onFailure?: (error: Error) => void },
  ): QueuedMessage {
    // Guard: do not double-enqueue the exact same content for the same conversation
    const duplicate = this.queue.find(
      (q) => q.conversationId === msg.conversationId && q.content === msg.content,
    );
    if (duplicate) return duplicate;

    // Enforce maximum queue size: drop the oldest entry to make room
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      const oldest = this.queue.shift();
      if (oldest) {
        try {
          oldest.onFailure?.(new Error('Queue full: oldest message dropped'));
        } catch {
          // Ignore callback errors
        }
      }
    }

    const entry: QueuedMessage = {
      ...msg,
      id: `qmsg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
      onSuccess: callbacks?.onSuccess,
      onFailure: callbacks?.onFailure,
    };

    this.queue.push(entry);
    this.persistToStorage();
    return entry;
  }

  /** Return a snapshot of the current queue (defensive copy). */
  getQueue(): QueuedMessage[] {
    return [...this.queue];
  }

  /** Number of messages currently waiting to be sent. */
  getQueueSize(): number {
    return this.queue.length;
  }

  /** Whether the queue is actively draining. */
  get isProcessing(): boolean {
    return this._isProcessing;
  }

  /**
   * Drain the queue in FIFO order.
   *
   * Each entry is passed to sendFn. On success:
   *   - entry is removed from the queue
   *   - entry.onSuccess() is called (if set)
   *
   * On failure:
   *   - retryCount is incremented
   *   - If under MAX_RETRY_COUNT: a backoff delay is inserted, then we stop
   *     processing remaining entries (wait for the next reconnect cycle)
   *   - If at MAX_RETRY_COUNT: entry is dropped, entry.onFailure(err) is called
   *
   * Callbacks are invoked synchronously after each attempt — they are
   * guaranteed to fire even if processQueue() is not awaited by the caller.
   *
   * No-ops if already processing.
   */
  async processQueue(sendFn: (msg: QueuedMessage) => Promise<void>): Promise<void> {
    if (this._isProcessing || this.queue.length === 0) return;

    this._isProcessing = true;

    // Process from front of live queue — new enqueue() calls during drain are
    // picked up immediately (no stale snapshot).
    while (this.queue.length > 0) {
      const entry = this.queue[0]!;
      if (!entry) break;

      try {
        await sendFn(entry);
        // Success — remove from queue, persist, and fire success callback
        this.queue = this.queue.filter((q) => q.id !== entry.id);
        this.persistToStorage();
        try {
          entry.onSuccess?.();
        } catch (cbErr) {
          console.warn('[OfflineQueue] onSuccess callback error:', cbErr);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        entry.retryCount += 1;

        if (entry.retryCount >= MAX_RETRY_COUNT) {
          // Drop after max retries — persist removal, then call failure callback
          this.queue = this.queue.filter((q) => q.id !== entry.id);
          this.persistToStorage();
          try {
            entry.onFailure?.(error);
          } catch (cbErr) {
            console.warn('[OfflineQueue] onFailure callback error:', cbErr);
          }
          // Continue to next entry — this one is permanently gone
          continue;
        }

        // Under limit: apply backoff then stop — wait for next reconnect
        const delay = backoffDelay(entry.retryCount - 1);
        await sleep(delay);
        break;
      }
    }

    this._isProcessing = false;
  }

  /** Remove all queued messages (e.g. on sign-out). */
  clear(): void {
    // Fire onFailure for each entry before clearing so callers can clean up UI
    for (const entry of this.queue) {
      try {
        entry.onFailure?.(new Error('Queue cleared'));
      } catch {
        // Ignore callback errors during forced clear
      }
    }
    this.queue = [];
    this._isProcessing = false;
    this.persistToStorage();
  }
}

export const offlineQueue = new OfflineMessageQueue();
// Restore any persisted queue entries from the previous session
offlineQueue.restoreFromStorage();
