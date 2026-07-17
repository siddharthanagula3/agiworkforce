/**
 * Offline Queue (Web wrapper)
 *
 * Web-surface binding of the shared `@agiworkforce/client-runtime/offline-queue`
 * factory. Provides browser-localStorage storage, the pino-style logger
 * from `@/lib/logger`, an `/api/health` HEAD probe, and a
 * `window.addEventListener('storage')` change subscriber.
 *
 * The previous standalone implementation lived in this file and was
 * copy-ported to `apps/desktop/src/lib/offline/offlineQueue.ts`. Both
 * surfaces now share the canonical factory; only the adapters differ.
 */

import { createOfflineQueue } from '@agiworkforce/client-runtime/offline-queue';
import { safeGetJSON, safeSetJSON } from '@/utils/localStorage';
import { logger } from '@/lib/logger';

const OFFLINE_QUEUE_KEY = 'agi_offline_queue';

const queue = createOfflineQueue({
  storage: {
    getJSON: safeGetJSON,
    setJSON: safeSetJSON,
    remove: (key) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        logger.error({ err: error }, '[OfflineQueue] failed to remove storage key');
      }
    },
  },
  logger: {
    error: (meta, message) => logger.error(meta, message ?? ''),
    warn: (messageOrMeta, message) =>
      typeof messageOrMeta === 'string'
        ? logger.warn(messageOrMeta)
        : logger.warn(messageOrMeta as Record<string, unknown>, message ?? ''),
    info: (messageOrMeta, message) =>
      typeof messageOrMeta === 'string'
        ? logger.info(messageOrMeta)
        : logger.info(messageOrMeta as Record<string, unknown>, message ?? ''),
  },
  storageKey: OFFLINE_QUEUE_KEY,
  probeOnline: async () => {
    if (!navigator.onLine) return false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('/api/health', {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  },
  onStorageChange: (storageKey, callback) => {
    const handler = (event: StorageEvent) => {
      if (event.key === storageKey) callback();
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  },
});

export const queueMessage = queue.queueMessage;
export const queueToolExecution = queue.queueToolExecution;
export const getQueuedItems = queue.getQueuedItems;
export const getQueuedItemCount = queue.getQueuedItemCount;
export const clearQueuedMessage = queue.clearQueuedMessage;
export const clearQueuedToolExecution = queue.clearQueuedToolExecution;
export const clearAllQueued = queue.clearAllQueued;
export const syncOfflineQueue = queue.syncOfflineQueue;
export const getLastSyncTime = queue.getLastSyncTime;
export const getMessageRetryStatus = queue.getMessageRetryStatus;
export const subscribeToQueueChanges = queue.subscribeToQueueChanges;

export type {
  QueuedMessage,
  QueuedToolExecution,
  OfflineQueueState,
  SyncCallbacks,
  SyncSummary,
} from '@agiworkforce/types';
