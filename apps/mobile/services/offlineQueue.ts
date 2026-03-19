/**
 * Offline message queue for the mobile app.
 *
 * When a message send fails due to a network error (not a streaming content
 * error), the message is pushed into this queue. When connectivity is restored,
 * processQueue() drains the queue in FIFO order, retrying each entry through
 * the provided sendFn callback.
 *
 * The queue is intentionally kept in memory only — messages that are queued
 * already appear in the chat store UI with a "queued" status indicator, so
 * they survive app-level state. If the process is killed, unprocessed queued
 * messages are lost; this is acceptable because the user sees the failed
 * messages in the chat and can retry manually.
 */

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
}

/** Maximum retry attempts per queued message before it is dropped */
const MAX_RETRY_COUNT = 3;

class OfflineMessageQueue {
  private queue: QueuedMessage[] = [];
  private _isProcessing: boolean = false;

  /**
   * Add a message to the end of the queue.
   * Ignores duplicates by conversationId + content to prevent double-queuing
   * the same message on rapid reconnect cycles.
   */
  enqueue(msg: Omit<QueuedMessage, 'id' | 'queuedAt' | 'retryCount'>): QueuedMessage {
    // Guard: do not double-enqueue the exact same content for the same conversation
    const duplicate = this.queue.find(
      (q) => q.conversationId === msg.conversationId && q.content === msg.content,
    );
    if (duplicate) return duplicate;

    const entry: QueuedMessage = {
      ...msg,
      id: `qmsg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
    };

    this.queue.push(entry);
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
   * Each entry is passed to sendFn. On success it is removed from the queue.
   * On failure the retryCount is incremented; entries that exceed
   * MAX_RETRY_COUNT are dropped to prevent infinite loops.
   *
   * No-ops if already processing.
   */
  async processQueue(sendFn: (msg: QueuedMessage) => Promise<void>): Promise<void> {
    if (this._isProcessing || this.queue.length === 0) return;

    this._isProcessing = true;

    // Snapshot the queue to avoid mutating while iterating
    const entries = [...this.queue];

    for (const entry of entries) {
      // If the entry was already removed by a concurrent clear(), skip it
      if (!this.queue.includes(entry)) continue;

      try {
        await sendFn(entry);
        // Success — remove from queue
        this.queue = this.queue.filter((q) => q.id !== entry.id);
      } catch {
        entry.retryCount += 1;

        if (entry.retryCount >= MAX_RETRY_COUNT) {
          // Drop after max retries — user sees failure state in chat UI
          this.queue = this.queue.filter((q) => q.id !== entry.id);
        }
        // If under limit, leave in queue for the next reconnect cycle
        // Stop processing remaining entries to avoid hammering a flaky connection
        break;
      }
    }

    this._isProcessing = false;
  }

  /** Remove all queued messages (e.g. on sign-out). */
  clear(): void {
    this.queue = [];
    this._isProcessing = false;
  }
}

export const offlineQueue = new OfflineMessageQueue();
