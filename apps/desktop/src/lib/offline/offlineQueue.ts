/**
 * Offline Queue (Desktop wrapper)
 *
 * Desktop-surface binding of the shared `@agiworkforce/runtime/offline-queue`
 * factory. Provides browser-localStorage storage (Tauri webview),
 * console-based logging, and a `window.addEventListener('storage')`
 * change subscriber. No network probe — Tauri webview cannot reliably
 * reach the web `/api/health` route, so callers gate sync via the
 * SyncManager's own `navigator.onLine` listener.
 */

import { createOfflineQueue } from '@agiworkforce/runtime';
import { safeGetJSON, safeSetJSON } from '@/utils/localStorage';

const OFFLINE_QUEUE_KEY = 'agi_offline_queue';

const queue = createOfflineQueue({
  storage: {
    getJSON: safeGetJSON,
    setJSON: safeSetJSON,
    remove: (key) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn('[OfflineQueue] failed to remove storage key', error);
      }
    },
  },
  logger: {
    error: (meta, message) => console.error('[OfflineQueue]', message ?? '', meta),
    warn: (messageOrMeta, message) =>
      typeof messageOrMeta === 'string'
        ? console.warn(messageOrMeta)
        : console.warn('[OfflineQueue]', message ?? '', messageOrMeta),
    // eslint forbids console.info in this surface; route through debug instead
    info: (messageOrMeta, message) =>
      typeof messageOrMeta === 'string'
        ? console.debug(messageOrMeta)
        : console.debug('[OfflineQueue]', message ?? '', messageOrMeta),
  },
  storageKey: OFFLINE_QUEUE_KEY,
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
