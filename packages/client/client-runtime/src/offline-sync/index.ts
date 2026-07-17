/**
 * Shared offline sync manager factory.
 *
 * Higher-level orchestration on top of `@agiworkforce/client-runtime/offline-queue`:
 *   - Tracks `SyncManagerState` (state machine: ONLINE / OFFLINE / SYNCING / ERROR).
 *   - Listens to browser online/offline events and debounces sync on
 *     connectivity restored.
 *   - Schedules exponential-backoff retries on sync failure.
 *   - Notifies UI subscribers of state changes.
 *
 * Browser primitives (`window` event listeners, `navigator.onLine`,
 * `setTimeout`) are injected via the `OfflineSyncOptions` adapters so
 * this module is unit-testable in Node and reusable across web + desktop
 * surfaces without copy-paste.
 *
 * Surface integration:
 *   - `apps/web/lib/offline/offlineSync.ts` — passes the web offline-queue
 *     instance, wires real `window` events, real `navigator.onLine`.
 *   - `apps/desktop/src/lib/offline/offlineSync.ts` — same shape with the
 *     desktop queue instance.
 */

import type { SyncCallbacks, SyncManagerState, SyncSummary } from '@agiworkforce/types';
import { SyncState } from '@agiworkforce/types';

export type { SyncCallbacks, SyncManagerState, SyncSummary };
export { SyncState };

export interface OfflineSyncQueueAdapter {
  syncOfflineQueue(callbacks?: SyncCallbacks): Promise<SyncSummary>;
  getQueuedItemCount(): number;
  subscribeToQueueChanges(callback: () => void): () => void;
}

export interface OfflineSyncLogger {
  error(meta: unknown, message?: string): void;
}

export interface OfflineSyncNetworkHandlers {
  onOnline(): void;
  onOffline(): void;
}

export interface OfflineSyncOptions {
  queue: OfflineSyncQueueAdapter;
  /** Logger for non-fatal sync failures. Default: console.error. */
  logger?: OfflineSyncLogger;
  /** Subscribe to browser online/offline events. Returns cleanup. Default:
   *  uses `window.addEventListener` if a `window` global exists; otherwise
   *  returns a no-op cleanup (manual driving in tests). */
  subscribeNetworkEvents?: (handlers: OfflineSyncNetworkHandlers) => () => void;
  /** Read current online state. Default: `navigator.onLine` if available,
   *  otherwise `false`. */
  readInitialOnline?: () => boolean;
  /** Debounce delay before performing sync after connectivity restored. */
  syncDebounceMs?: number;
  /** Base delay for retry backoff after a failed sync. */
  retryBaseMs?: number;
  /** Cap on retry backoff. */
  retryMaxMs?: number;
}

export interface OfflineSyncManager {
  initialize(): void;
  cleanup(): void;
  triggerSync(): Promise<void>;
  retrySync(): Promise<void>;
  getState(): Readonly<SyncManagerState>;
  isOnline(): boolean;
  subscribeState(callback: (state: SyncManagerState) => void): () => void;
  getStatusMessage(): string;
  getStatusSeverity(): 'success' | 'warning' | 'error' | 'info';
}

const DEFAULT_SYNC_DEBOUNCE_MS = 2000;
const DEFAULT_RETRY_BASE_MS = 5000;
const DEFAULT_RETRY_MAX_MS = 120_000;

function defaultLogger(): OfflineSyncLogger {
  return {
    error: (meta, message) => {
      console.error('[OfflineSync]', message ?? '', meta);
    },
  };
}

function defaultReadInitialOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : false;
}

function defaultSubscribeNetworkEvents(handlers: OfflineSyncNetworkHandlers): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', handlers.onOnline);
  window.addEventListener('offline', handlers.onOffline);
  return () => {
    window.removeEventListener('online', handlers.onOnline);
    window.removeEventListener('offline', handlers.onOffline);
  };
}

export function createOfflineSyncManager(opts: OfflineSyncOptions): OfflineSyncManager {
  const {
    queue,
    logger = defaultLogger(),
    subscribeNetworkEvents = defaultSubscribeNetworkEvents,
    readInitialOnline = defaultReadInitialOnline,
    syncDebounceMs = DEFAULT_SYNC_DEBOUNCE_MS,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
    retryMaxMs = DEFAULT_RETRY_MAX_MS,
  } = opts;

  const managerState: SyncManagerState = {
    state: SyncState.OFFLINE,
    isOnline: false,
    queuedCount: 0,
  };

  const stateChangeCallbacks: Set<(state: SyncManagerState) => void> = new Set();

  let unsubscribeFromQueue: (() => void) | null = null;
  let unsubscribeFromNetwork: (() => void) | null = null;
  let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let syncRetryTimeout: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;
  let isInitialized = false;

  function notifyStateChange(): void {
    const snapshot = { ...managerState };
    for (const callback of stateChangeCallbacks) {
      try {
        callback(snapshot);
      } catch (error) {
        logger.error({ err: error }, '[OfflineSync] error in state-change callback');
      }
    }
  }

  function updateIsOnline(online: boolean): void {
    managerState.isOnline = online;
    managerState.state = online ? SyncState.ONLINE : SyncState.OFFLINE;
    notifyStateChange();
  }

  function updateQueuedCount(): void {
    managerState.queuedCount = queue.getQueuedItemCount();
    notifyStateChange();
  }

  function scheduleRetry(): void {
    if (syncRetryTimeout) {
      clearTimeout(syncRetryTimeout);
    }
    const delayMs = Math.min(retryBaseMs * Math.pow(2, retryCount), retryMaxMs);
    retryCount++;

    syncRetryTimeout = setTimeout(() => {
      if (managerState.isOnline) {
        void manager.triggerSync();
      }
    }, delayMs);
  }

  async function performSync(): Promise<void> {
    if (!managerState.isOnline) return;

    managerState.state = SyncState.SYNCING;
    notifyStateChange();

    try {
      const summary = await queue.syncOfflineQueue();

      managerState.lastSyncTime = new Date();
      managerState.lastSyncSummary = summary;
      delete managerState.error;
      retryCount = 0;

      updateQueuedCount();
      managerState.state = SyncState.ONLINE;
    } catch (error) {
      logger.error({ err: error }, '[OfflineSync] sync failed');
      managerState.state = SyncState.ERROR;
      managerState.error = error instanceof Error ? error : new Error(String(error));
      scheduleRetry();
    }

    notifyStateChange();
  }

  function handleOnline(): void {
    updateIsOnline(true);
    void manager.triggerSync();
  }

  function handleOffline(): void {
    updateIsOnline(false);
  }

  const manager: OfflineSyncManager = {
    initialize() {
      if (isInitialized) return;
      isInitialized = true;

      updateIsOnline(readInitialOnline());

      unsubscribeFromNetwork = subscribeNetworkEvents({
        onOnline: handleOnline,
        onOffline: handleOffline,
      });

      unsubscribeFromQueue = queue.subscribeToQueueChanges(() => {
        updateQueuedCount();
      });

      updateQueuedCount();
      notifyStateChange();
    },

    cleanup() {
      if (unsubscribeFromNetwork) {
        unsubscribeFromNetwork();
        unsubscribeFromNetwork = null;
      }

      if (unsubscribeFromQueue) {
        unsubscribeFromQueue();
        unsubscribeFromQueue = null;
      }

      if (syncRetryTimeout) {
        clearTimeout(syncRetryTimeout);
        syncRetryTimeout = null;
      }

      if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
        syncDebounceTimer = null;
      }

      retryCount = 0;
      isInitialized = false;
    },

    async triggerSync() {
      if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
      }

      if (managerState.queuedCount === 0) return;
      if (managerState.state === SyncState.SYNCING) return;

      syncDebounceTimer = setTimeout(() => {
        void performSync();
      }, syncDebounceMs);
    },

    async retrySync() {
      if (syncRetryTimeout) {
        clearTimeout(syncRetryTimeout);
        syncRetryTimeout = null;
      }
      await performSync();
    },

    getState() {
      return { ...managerState };
    },

    isOnline() {
      return managerState.isOnline;
    },

    subscribeState(callback) {
      stateChangeCallbacks.add(callback);
      return () => {
        stateChangeCallbacks.delete(callback);
      };
    },

    getStatusMessage() {
      switch (managerState.state) {
        case SyncState.ONLINE:
          return managerState.queuedCount > 0
            ? `${managerState.queuedCount} item(s) synced`
            : 'Online';
        case SyncState.OFFLINE:
          return managerState.queuedCount > 0
            ? `Offline - ${managerState.queuedCount} pending`
            : 'Offline';
        case SyncState.SYNCING:
          return 'Syncing...';
        case SyncState.ERROR:
          return 'Sync failed - will retry';
        default:
          return 'Unknown';
      }
    },

    getStatusSeverity() {
      switch (managerState.state) {
        case SyncState.ONLINE:
          return managerState.queuedCount > 0 ? 'info' : 'success';
        case SyncState.OFFLINE:
          return managerState.queuedCount > 0 ? 'warning' : 'info';
        case SyncState.SYNCING:
          return 'info';
        case SyncState.ERROR:
          return 'error';
        default:
          return 'info';
      }
    },
  };

  return manager;
}
