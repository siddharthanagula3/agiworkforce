import { isUuidV7, uuidv7 } from '@agiworkforce/utils/uuidv7';
import { storage, whenMmkvReady } from '@/lib/mmkv';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

export type OfflineQueueProvenance = { scope: 'local' } | { scope: 'cloud'; ownerId: string };

export interface OfflineReplayIdentity {
  questionId: string;
  assistantMessageId: string;
}

export interface QueuedMessage {
  id: string;
  conversationId: string;
  content: string;
  model: string;
  skillName?: string;
  queuedAt: string;
  retryCount: number;
  provenance: OfflineQueueProvenance;
  replayIdentity?: OfflineReplayIdentity;
  onSuccess?: () => void;
  onFailure?: (error: Error) => void;
}

export class OfflineQueueAdmissionError extends Error {
  constructor(readonly reason: 'queue-full' | 'storage-unavailable') {
    super(reason);
  }
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
  skillName?: string;
  queuedAt: string;
  retryCount: number;
  provenance: OfflineQueueProvenance;
  replayIdentity?: OfflineReplayIdentity;
}

function backoffDelay(retryCount: number): number {
  return Math.min(BASE_BACKOFF_MS * Math.pow(2, retryCount), MAX_BACKOFF_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOfflineReplayIdentity(value: unknown): value is OfflineReplayIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const { questionId, assistantMessageId } = value as Record<string, unknown>;
  return (
    typeof questionId === 'string' &&
    typeof assistantMessageId === 'string' &&
    isUuidV7(questionId) &&
    isUuidV7(assistantMessageId) &&
    questionId !== assistantMessageId
  );
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
    isOfflineQueueProvenance(entry.provenance) &&
    (entry.replayIdentity === undefined || isOfflineReplayIdentity(entry.replayIdentity)) &&
    (entry.skillName === undefined ||
      (entry.provenance.scope === 'cloud' && isQueuedSkillName(entry.skillName)))
  );
}

function isQueuedSkillName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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
  private generation = 0;
  private processor: { generation: number } | null = null;
  private listeners = new Set<() => void>();
  private failureListeners = new Set<(entry: QueuedMessage, error: Error) => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onEntryFailed(listener: (entry: QueuedMessage, error: Error) => void): () => void {
    this.failureListeners.add(listener);
    return () => {
      this.failureListeners.delete(listener);
    };
  }

  private reportFailure(entry: QueuedMessage, error: Error): void {
    try {
      entry.onFailure?.(error);
    } catch (cbErr) {
      console.warn('[OfflineQueue] onFailure callback error:', cbErr);
    }
    for (const listener of this.failureListeners) {
      try {
        listener(entry, error);
      } catch (cbErr) {
        console.warn('[OfflineQueue] failure listener error:', cbErr);
      }
    }
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

  private writeQueue(queue: readonly QueuedMessage[]): string {
    const entries: PersistedQueueEntry[] = queue.map(
      ({
        id,
        conversationId,
        content,
        model,
        skillName,
        queuedAt,
        retryCount,
        provenance,
        replayIdentity,
      }) => ({
        id,
        conversationId,
        content,
        model,
        skillName,
        queuedAt,
        retryCount,
        provenance,
        replayIdentity,
      }),
    );
    const serialized = JSON.stringify(entries);
    storage.set(QUEUE_STORAGE_KEY, serialized);
    return serialized;
  }

  private verifyQueueWrite(queue: readonly QueuedMessage[]): boolean {
    try {
      const serialized = this.writeQueue(queue);
      return storage.getString(QUEUE_STORAGE_KEY) === serialized;
    } catch {
      return false;
    }
  }

  private ensureReplayIdentity(entry: QueuedMessage): boolean {
    if (entry.replayIdentity) return true;
    const replayIdentity = { questionId: uuidv7(), assistantMessageId: uuidv7() };
    const updated = this.queue.map((item) => (item === entry ? { ...item, replayIdentity } : item));
    if (!this.verifyQueueWrite(updated)) return false;
    entry.replayIdentity = replayIdentity;
    return true;
  }

  private persistToStorage(): void {
    try {
      this.writeQueue(this.queue);
    } catch (err) {
      console.warn('[OfflineQueue] Failed to persist queue to MMKV:', err);
    }
    this.notify();
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
      const previousSize = this.queue.length;
      for (const entry of entries) {
        if (!this.queue.some((q) => q.id === entry.id)) {
          this.queue.push(entry);
        }
      }
      if (this.queue.length !== previousSize) this.notify();
    } catch (err) {
      console.warn('[OfflineQueue] Corrupted queue data, resetting:', err);
      storage.delete(QUEUE_STORAGE_KEY);
    }
  }

  /**
   * Add a message to the end of the queue.
   *
   * @param onSuccess - Called after the message is successfully sent.
   * @param onFailure - Called if the message is dropped after exhausting retries.
   */
  enqueue(
    msg: Omit<
      QueuedMessage,
      'id' | 'queuedAt' | 'retryCount' | 'replayIdentity' | 'onSuccess' | 'onFailure'
    >,
    callbacks?: { onSuccess?: () => void; onFailure?: (error: Error) => void },
  ): QueuedMessage {
    const provenance = requireOfflineQueueProvenance(msg.provenance);
    if (
      msg.skillName !== undefined &&
      (provenance.scope !== 'cloud' || !isQueuedSkillName(msg.skillName))
    ) {
      throw new Error('A queued account skill requires Cloud scope and a non-empty name');
    }
    const duplicate = this.queue.find(
      (q) =>
        q.conversationId === msg.conversationId &&
        q.content === msg.content &&
        q.model === msg.model &&
        q.skillName === msg.skillName &&
        hasSameProvenance(q.provenance, provenance),
    );
    if (duplicate) return duplicate;

    if (this.queue.length >= MAX_QUEUE_SIZE) {
      throw new OfflineQueueAdmissionError('queue-full');
    }

    const entry: QueuedMessage = {
      ...msg,
      provenance,
      id: `qmsg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
      onSuccess: callbacks?.onSuccess,
      onFailure: callbacks?.onFailure,
    };

    const nextQueue = [...this.queue, entry];
    if (!this.verifyQueueWrite(nextQueue)) {
      throw new OfflineQueueAdmissionError('storage-unavailable');
    }
    this.queue = nextQueue;
    this.notify();
    return entry;
  }

  getQueue(): QueuedMessage[] {
    return [...this.queue];
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  get isProcessing(): boolean {
    return this.processor !== null;
  }

  async processQueue(
    sendFn: (msg: QueuedMessage) => Promise<void | 'conversation-busy'>,
    isReady: () => boolean = () => true,
  ): Promise<void> {
    if (this.processor || this.queue.length === 0) return;

    const processor = { generation: this.generation };
    this.processor = processor;
    const busyConversations = new Set<string>();
    const ownsQueue = () =>
      this.processor === processor && processor.generation === this.generation;

    try {
      while (ownsQueue() && this.queue.length > 0) {
        if (!isReady()) break;
        const currentAccount = captureCloudAccountEpoch();
        const unsafeCloudEntry = currentAccount
          ? this.queue.find(
              (queued) =>
                queued.provenance.scope === 'cloud' &&
                queued.provenance.ownerId !== currentAccount.ownerId,
            )
          : undefined;
        if (unsafeCloudEntry) {
          this.dropEntry(
            unsafeCloudEntry,
            new Error('Queued Cloud prompt belongs to a different or expired account'),
          );
          continue;
        }

        const currentMode = useChatAppModeStore.getState().appMode;
        const entry = this.queue.find(
          (queued) =>
            !busyConversations.has(queued.conversationId) &&
            queued.provenance.scope === currentMode &&
            (queued.provenance.scope === 'local' || currentAccount !== null),
        );
        if (!entry || !this.ensureReplayIdentity(entry)) break;
        const account = entry.provenance.scope === 'cloud' ? captureCloudAccountEpoch() : null;

        try {
          const outcome = await sendFn(entry);
          if (!ownsQueue()) break;
          if (!this.queue.includes(entry)) continue;
          if (entry.provenance.scope === 'cloud' && !isCloudAccountEpochCurrent(account)) {
            this.dropEntry(entry, new Error('Cloud account changed while replaying queued prompt'));
            continue;
          }
          if (outcome === 'conversation-busy') {
            busyConversations.add(entry.conversationId);
            continue;
          }
          this.queue = this.queue.filter((queued) => queued !== entry);
          this.persistToStorage();
          try {
            entry.onSuccess?.();
          } catch (cbErr) {
            console.warn('[OfflineQueue] onSuccess callback error:', cbErr);
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          if (!ownsQueue()) break;
          if (!this.queue.includes(entry)) continue;
          if (entry.provenance.scope === 'cloud' && !isCloudAccountEpochCurrent(account)) {
            this.dropEntry(entry, new Error('Cloud account changed while replaying queued prompt'));
            continue;
          }
          entry.retryCount += 1;

          if (entry.retryCount >= MAX_RETRY_COUNT) {
            this.dropEntry(entry, error);
            continue;
          }

          this.persistToStorage();
          const delay = backoffDelay(entry.retryCount - 1);
          await sleep(delay);
          break;
        }
      }
    } finally {
      if (this.processor === processor) {
        this.processor = null;
        if (busyConversations.size > 0) this.notify();
      }
    }
  }

  clear(): void {
    this.generation += 1;
    const cleared = this.queue;
    this.queue = [];
    for (const entry of cleared) this.reportFailure(entry, new Error('Queue cleared'));
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
    for (const entry of removed)
      this.reportFailure(entry, new Error('Cloud account queue cleared'));
    this.persistToStorage();
  }

  private dropEntry(entry: QueuedMessage, error: Error): void {
    if (!this.queue.includes(entry)) return;
    this.queue = this.queue.filter((queued) => queued !== entry);
    this.persistToStorage();
    this.reportFailure(entry, error);
  }
}

export const offlineQueue = new OfflineMessageQueue();
whenMmkvReady(() => offlineQueue.restoreFromStorage());

export function clearAccountScopedOfflineQueue(): void {
  offlineQueue.clearAccountScopedEntries();
}
