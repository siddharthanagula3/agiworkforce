
import { storage, whenMmkvReady } from '@/lib/mmkv';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

export type OfflineQueueProvenance = { scope: 'local' } | { scope: 'cloud'; ownerId: string };

export interface QueuedMessage {
  id: string;
  conversationId: string;
  content: string;
  model: string;
  queuedAt: string;
  retryCount: number;
  provenance: OfflineQueueProvenance;
  onSuccess?: () => void;
  onFailure?: (error: Error) => void;
}

const MAX_RETRY_COUNT = 3;

const MAX_QUEUE_SIZE = 100;

const BASE_BACKOFF_MS = 1_000;

const MAX_BACKOFF_MS = 8_000;

const QUEUE_STORAGE_KEY = 'offline_queue_v1';

interface PersistedQueueEntry {
  id: string;
  conversationId: string;
  content: string;
  model: string;
  queuedAt: string;
  retryCount: number;
  provenance: OfflineQueueProvenance;
}

function backoffDelay(retryCount: number): number {
  return Math.min(BASE_BACKOFF_MS * Math.pow(2, retryCount), MAX_BACKOFF_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPersistedQueueEntry(value: unknown): value is PersistedQueueEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.conversationId === 'string' &&
    typeof entry.content === 'string' &&
    typeof entry.model === 'string' &&
    typeof entry.queuedAt === 'string' &&
    typeof entry.retryCount === 'number' &&
    Number.isInteger(entry.retryCount) &&
    entry.retryCount >= 0 &&
    entry.retryCount <= MAX_RETRY_COUNT &&
    isOfflineQueueProvenance(entry.provenance)
  );
}

function normalizedOwnerId(ownerId: unknown): string | null {
  return typeof ownerId === 'string' && ownerId.trim().length > 0 ? ownerId.trim() : null;
}

function isOfflineQueueProvenance(value: unknown): value is OfflineQueueProvenance {
  if (!value || typeof value !== 'object') return false;
  const provenance = value as Record<string, unknown>;
  if (provenance.scope === 'local') return true;
  return provenance.scope === 'cloud' && normalizedOwnerId(provenance.ownerId) !== null;
}

function requireOfflineQueueProvenance(provenance: OfflineQueueProvenance): OfflineQueueProvenance {
  if (!isOfflineQueueProvenance(provenance)) {
    throw new Error('Offline queue entries require Local scope or a non-empty Cloud owner id');
  }
  if (provenance.scope === 'local') return { scope: 'local' };

  const account = captureCloudAccountEpoch();
  const ownerId = provenance.ownerId.trim();
  if (!account || account.ownerId !== ownerId) {
    throw new Error('Cannot queue a Cloud prompt for an inactive account');
  }
  return { scope: 'cloud', ownerId };
}

function hasSameProvenance(left: OfflineQueueProvenance, right: OfflineQueueProvenance): boolean {
  if (left.scope !== right.scope) return false;
  if (left.scope === 'local') return true;
  return left.ownerId === (right as { scope: 'cloud'; ownerId: string }).ownerId;
}

class OfflineMessageQueue {
  private queue: QueuedMessage[] = [];
  private _isProcessing: boolean = false;
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // A listener error must never break queue mutation.
      }
    }
  }

  private persistToStorage(): void {
    this.notify();
    try {
      const entries: PersistedQueueEntry[] = this.queue.map(
        ({ id, conversationId, content, model, queuedAt, retryCount, provenance }) => ({
          id,
          conversationId,
          content,
          model,
          queuedAt,
          retryCount,
          provenance,
        }),
      );
      storage.set(QUEUE_STORAGE_KEY, JSON.stringify(entries));
    } catch (err) {
      console.warn('[OfflineQueue] Failed to persist queue to MMKV:', err);
    }
  }

  restoreFromStorage(): void {
    try {
      const raw = storage.getString(QUEUE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        storage.delete(QUEUE_STORAGE_KEY);
        return;
      }
      const entries = parsed.filter(isPersistedQueueEntry).slice(0, MAX_QUEUE_SIZE);
      if (entries.length !== parsed.length) {
        storage.set(QUEUE_STORAGE_KEY, JSON.stringify(entries));
      }
      for (const entry of entries) {
        if (!this.queue.some((q) => q.id === entry.id)) {
          this.queue.push(entry);
        }
      }
    } catch (err) {
      console.warn('[OfflineQueue] Corrupted queue data, resetting:', err);
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
    const duplicate = this.queue.find(
      (q) =>
        q.conversationId === msg.conversationId &&
        q.content === msg.content &&
        hasSameProvenance(q.provenance, msg.provenance),
    );
    if (duplicate) return duplicate;

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
      provenance: requireOfflineQueueProvenance(msg.provenance),
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

  getQueue(): QueuedMessage[] {
    return [...this.queue];
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  get isProcessing(): boolean {
    return this._isProcessing;
  }

  async processQueue(sendFn: (msg: QueuedMessage) => Promise<void>): Promise<void> {
    if (this._isProcessing || this.queue.length === 0) return;

    this._isProcessing = true;

    while (this.queue.length > 0) {
      const unsafeCloudEntry = this.queue.find((queued) => {
        if (queued.provenance.scope !== 'cloud') return false;
        const currentAccount = captureCloudAccountEpoch();
        return !currentAccount || currentAccount.ownerId !== queued.provenance.ownerId;
      });
      if (unsafeCloudEntry) {
        this.dropEntry(
          unsafeCloudEntry,
          new Error('Queued Cloud prompt belongs to a different or expired account'),
        );
        continue;
      }

      const currentMode = useChatAppModeStore.getState().appMode;
      const entry = this.queue.find((queued) => queued.provenance.scope === currentMode);
      if (!entry) break;
      const account = entry.provenance.scope === 'cloud' ? captureCloudAccountEpoch() : null;

      try {
        await sendFn(entry);
        if (entry.provenance.scope === 'cloud' && !isCloudAccountEpochCurrent(account)) {
          this.dropEntry(entry, new Error('Cloud account changed while replaying queued prompt'));
          continue;
        }
        this.queue = this.queue.filter((q) => q.id !== entry.id);
        this.persistToStorage();
        try {
          entry.onSuccess?.();
        } catch (cbErr) {
          console.warn('[OfflineQueue] onSuccess callback error:', cbErr);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (!this.queue.some((queued) => queued.id === entry.id)) {
          continue;
        }
        if (entry.provenance.scope === 'cloud' && !isCloudAccountEpochCurrent(account)) {
          this.dropEntry(entry, new Error('Cloud account changed while replaying queued prompt'));
          continue;
        }
        entry.retryCount += 1;

        if (entry.retryCount >= MAX_RETRY_COUNT) {
          this.queue = this.queue.filter((q) => q.id !== entry.id);
          this.persistToStorage();
          try {
            entry.onFailure?.(error);
          } catch (cbErr) {
            console.warn('[OfflineQueue] onFailure callback error:', cbErr);
          }
          continue;
        }

        this.persistToStorage();
        const delay = backoffDelay(entry.retryCount - 1);
        await sleep(delay);
        break;
      }
    }

    this._isProcessing = false;
  }

  clear(): void {
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

  clearAccountScopedEntries(): void {
    const retained: QueuedMessage[] = [];
    const removed: QueuedMessage[] = [];
    for (const entry of this.queue) {
      if (isOfflineQueueProvenance(entry.provenance) && entry.provenance.scope === 'local') {
        retained.push(entry);
      } else {
        removed.push(entry);
      }
    }
    this.queue = retained;
    for (const entry of removed) {
      try {
        entry.onFailure?.(new Error('Cloud account queue cleared'));
      } catch {
        // Ignore callback failures while crossing an account boundary.
      }
    }
    this.persistToStorage();
  }

  private dropEntry(entry: QueuedMessage, error: Error): void {
    this.queue = this.queue.filter((queued) => queued.id !== entry.id);
    this.persistToStorage();
    try {
      entry.onFailure?.(error);
    } catch {
      // A callback error must never keep an unsafe queue entry alive.
    }
  }
}

export const offlineQueue = new OfflineMessageQueue();
whenMmkvReady(() => offlineQueue.restoreFromStorage());

export function clearAccountScopedOfflineQueue(): void {
  offlineQueue.clearAccountScopedEntries();
}
