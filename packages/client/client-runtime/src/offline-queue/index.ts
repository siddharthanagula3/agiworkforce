/**
 * Shared offline queue factory.
 *
 * Manages a queue of chat messages and tool-execution requests that the
 * user enqueued while offline, with exponential-backoff retries and
 * subscribe-to-changes for reactive UI. Browser-environment APIs
 * (`window`, `navigator`, `localStorage`) are injected via the
 * `OfflineQueueOptions` adapters so this module is testable in a Node
 * environment and reusable across web + desktop without duplication.
 *
 * Each surface creates its own instance via `createOfflineQueue(opts)`,
 * binding its own storage helpers, logger, and (optionally) an
 * `onStorageChange` subscriber + `probeOnline` network check. The
 * canonical types live in `@agiworkforce/types/web-offline`.
 *
 * Surface integration:
 *   - `apps/web/lib/offline/offlineQueue.ts` — uses safeGetJSON/safeSetJSON
 *     from `@/utils/localStorage`, pino-style logger from `@/lib/logger`,
 *     and a `/api/health` HEAD probe.
 *   - `apps/desktop/src/lib/offline/offlineQueue.ts` — same storage,
 *     console-based logger, no network probe (Tauri webview can't reach
 *     the web /api/health route).
 */

import type {
  OfflineQueueState,
  QueuedMessage,
  QueuedToolExecution,
  SyncCallbacks,
  SyncSummary,
} from '@agiworkforce/types';

export type { OfflineQueueState, QueuedMessage, QueuedToolExecution, SyncCallbacks, SyncSummary };

export interface OfflineQueueStorage {
  getJSON<T>(key: string, defaultValue: T): T;
  /** Persist a JSON value. Returns true on success. Implementations that
   *  return void are accepted (treated as success). */
  setJSON<T>(key: string, value: T): unknown;
  remove(key: string): void;
}

export interface OfflineQueueLogger {
  error(meta: unknown, message?: string): void;
  warn(messageOrMeta: unknown, message?: string): void;
  info(messageOrMeta: unknown, message?: string): void;
}

export interface OfflineQueueOptions {
  storage: OfflineQueueStorage;
  logger: OfflineQueueLogger;
  /** Subscribe to external storage mutations (e.g. another tab edits the
   *  queue). Returns an unsubscribe function. Default: returns a no-op
   *  unsubscribe — change notifications are only delivered to in-process
   *  mutators. */
  onStorageChange?: (storageKey: string, callback: () => void) => () => void;
  /** Probe whether the network is reachable. Default: always true — the
   *  surface is responsible for guarding sync at the call site. */
  probeOnline?: () => Promise<boolean>;
  /** Generate a queue-entry id. Default: combines `Date.now` with
   *  `Math.random` — local-only client identifier, not an auth token. */
  generateId?: (prefix: 'msg' | 'tool') => string;
  storageKey?: string;
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface MessageRetryStatus {
  retryCount: number;
  maxRetries: number;
  canRetry: boolean;
  nextRetryIn?: number;
}

export interface OfflineQueueApi {
  queueMessage(sessionId: string, content: string): string;
  queueToolExecution(
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
  ): string;
  getQueuedItems(): { messages: QueuedMessage[]; toolExecutions: QueuedToolExecution[] };
  getQueuedItemCount(): number;
  clearQueuedMessage(messageId: string): void;
  clearQueuedToolExecution(toolId: string): void;
  clearAllQueued(): void;
  syncOfflineQueue(callbacks?: SyncCallbacks): Promise<SyncSummary>;
  getLastSyncTime(): Date | null;
  getMessageRetryStatus(messageId: string): MessageRetryStatus | null;
  subscribeToQueueChanges(callback: () => void): () => void;
}

const DEFAULT_STORAGE_KEY = 'agi_offline_queue';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 30_000;

function defaultGenerateId(prefix: 'msg' | 'tool'): string {
  // Local-only queue identifier, not an auth token. Math.random is intentional.
  const random = Math.random().toString(36).slice(2, 11);
  return `${prefix}_${Date.now()}_${random}`;
}

export function createOfflineQueue(opts: OfflineQueueOptions): OfflineQueueApi {
  const {
    storage,
    logger,
    onStorageChange,
    probeOnline,
    generateId = defaultGenerateId,
    storageKey = DEFAULT_STORAGE_KEY,
    maxRetries = DEFAULT_MAX_RETRIES,
    initialBackoffMs = DEFAULT_INITIAL_BACKOFF_MS,
    maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
  } = opts;

  const emptyState = (): OfflineQueueState => ({ messages: [], toolExecutions: [] });

  function loadQueue(): OfflineQueueState {
    try {
      const data = storage.getJSON<OfflineQueueState>(storageKey, emptyState());
      return data || emptyState();
    } catch (error) {
      logger.error({ err: error }, '[OfflineQueue] failed to load queue');
      return emptyState();
    }
  }

  function saveQueue(queue: OfflineQueueState): void {
    try {
      storage.setJSON(storageKey, queue);
    } catch (error) {
      logger.error({ err: error }, '[OfflineQueue] failed to save queue');
    }
  }

  function getBackoffDelay(retryCount: number): number {
    return Math.min(initialBackoffMs * Math.pow(2, retryCount), maxBackoffMs);
  }

  function incrementMessageRetry(messageId: string): void {
    const queue = loadQueue();
    const next: OfflineQueueState = {
      ...queue,
      messages: queue.messages.map((m) =>
        m.id === messageId ? { ...m, retryCount: m.retryCount + 1 } : m,
      ),
    };
    saveQueue(next);
  }

  function incrementToolRetry(toolId: string): void {
    const queue = loadQueue();
    const next: OfflineQueueState = {
      ...queue,
      toolExecutions: queue.toolExecutions.map((t) =>
        t.id === toolId ? { ...t, retryCount: t.retryCount + 1 } : t,
      ),
    };
    saveQueue(next);
  }

  const api: OfflineQueueApi = {
    queueMessage(sessionId, content) {
      if (!sessionId?.trim() || !content?.trim()) {
        throw new Error('sessionId and content are required');
      }
      const id = generateId('msg');
      const queue = loadQueue();
      const message: QueuedMessage = {
        id,
        sessionId,
        content,
        timestamp: new Date().toISOString(),
        retryCount: 0,
        addedAt: new Date().toISOString(),
      };
      saveQueue({ ...queue, messages: [...queue.messages, message] });
      return id;
    },

    queueToolExecution(sessionId, toolName, toolInput) {
      if (!sessionId?.trim() || !toolName?.trim()) {
        throw new Error('sessionId and toolName are required');
      }
      const id = generateId('tool');
      const queue = loadQueue();
      const execution: QueuedToolExecution = {
        id,
        sessionId,
        toolName,
        toolInput,
        timestamp: new Date().toISOString(),
        retryCount: 0,
        addedAt: new Date().toISOString(),
      };
      saveQueue({ ...queue, toolExecutions: [...queue.toolExecutions, execution] });
      return id;
    },

    getQueuedItems() {
      const queue = loadQueue();
      return { messages: queue.messages, toolExecutions: queue.toolExecutions };
    },

    getQueuedItemCount() {
      const queue = loadQueue();
      return queue.messages.length + queue.toolExecutions.length;
    },

    clearQueuedMessage(messageId) {
      try {
        const queue = loadQueue();
        saveQueue({
          ...queue,
          messages: queue.messages.filter((m) => m.id !== messageId),
        });
      } catch (error) {
        logger.error({ err: error, messageId }, '[OfflineQueue] failed to clear queued message');
      }
    },

    clearQueuedToolExecution(toolId) {
      try {
        const queue = loadQueue();
        saveQueue({
          ...queue,
          toolExecutions: queue.toolExecutions.filter((t) => t.id !== toolId),
        });
      } catch (error) {
        logger.error(
          { err: error, toolId },
          '[OfflineQueue] failed to clear queued tool execution',
        );
      }
    },

    clearAllQueued() {
      try {
        storage.remove(storageKey);
      } catch (error) {
        logger.error({ err: error }, '[OfflineQueue] failed to clear all queued items');
      }
    },

    async syncOfflineQueue(callbacks) {
      const startTime = Date.now();
      const summary: SyncSummary = {
        messagesSynced: 0,
        messagesFailed: 0,
        toolsSynced: 0,
        toolsFailed: 0,
        totalTime: 0,
      };

      try {
        if (probeOnline) {
          const online = await probeOnline();
          if (!online) {
            logger.info('[OfflineQueue] still offline, skipping sync');
            callbacks?.onSyncComplete?.(false, summary);
            return summary;
          }
        }

        const queue = loadQueue();

        for (const message of queue.messages) {
          try {
            if (message.retryCount >= maxRetries) {
              logger.warn(`[OfflineQueue] max retries exceeded for message ${message.id}`);
              summary.messagesFailed++;
              api.clearQueuedMessage(message.id);
              continue;
            }

            if (callbacks?.onMessageSync) {
              await callbacks.onMessageSync(message);
              summary.messagesSynced++;
              api.clearQueuedMessage(message.id);
            }
          } catch (error) {
            logger.error(
              { err: error, messageId: message.id },
              '[OfflineQueue] failed to sync message',
            );
            incrementMessageRetry(message.id);
            summary.messagesFailed++;

            if (error instanceof Error && error.message.includes('401')) {
              throw error;
            }
          }
        }

        for (const tool of queue.toolExecutions) {
          try {
            if (tool.retryCount >= maxRetries) {
              logger.warn(`[OfflineQueue] max retries exceeded for tool ${tool.id}`);
              summary.toolsFailed++;
              api.clearQueuedToolExecution(tool.id);
              continue;
            }

            if (callbacks?.onToolSync) {
              await callbacks.onToolSync(tool);
              summary.toolsSynced++;
              api.clearQueuedToolExecution(tool.id);
            }
          } catch (error) {
            logger.error({ err: error, toolId: tool.id }, '[OfflineQueue] failed to sync tool');
            incrementToolRetry(tool.id);
            summary.toolsFailed++;

            if (error instanceof Error && error.message.includes('401')) {
              throw error;
            }
          }
        }

        const updatedQueue = loadQueue();
        saveQueue({ ...updatedQueue, lastSyncTime: new Date().toISOString() });

        summary.totalTime = Date.now() - startTime;
        callbacks?.onSyncComplete?.(true, summary);
        return summary;
      } catch (error) {
        logger.error({ err: error }, '[OfflineQueue] sync failed with fatal error');
        summary.totalTime = Date.now() - startTime;
        callbacks?.onSyncComplete?.(false, summary);
        throw error;
      }
    },

    getLastSyncTime() {
      try {
        const queue = loadQueue();
        return queue.lastSyncTime ? new Date(queue.lastSyncTime) : null;
      } catch (error) {
        logger.error({ err: error }, '[OfflineQueue] failed to read last sync time');
        return null;
      }
    },

    getMessageRetryStatus(messageId) {
      const queue = loadQueue();
      const message = queue.messages.find((m) => m.id === messageId);
      if (!message) return null;

      const canRetry = message.retryCount < maxRetries;
      return {
        retryCount: message.retryCount,
        maxRetries,
        canRetry,
        ...(canRetry ? { nextRetryIn: getBackoffDelay(message.retryCount) } : {}),
      };
    },

    subscribeToQueueChanges(callback) {
      if (!onStorageChange) {
        return () => {};
      }
      return onStorageChange(storageKey, callback);
    },
  };

  return api;
}
