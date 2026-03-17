/**
 * Offline Sync Manager (Desktop)
 *
 * Higher-level orchestration for offline queue synchronization.
 * Monitors network connectivity and triggers syncs appropriately.
 *
 * Ported from apps/web/lib/offline/offlineSync.ts for desktop integration.
 */

import { syncOfflineQueue, getQueuedItemCount, subscribeToQueueChanges } from './offlineQueue';
import type { SyncManagerState, SyncSummary } from '@agiworkforce/types';
import { SyncState } from '@agiworkforce/types';

export { SyncState };
export type { SyncManagerState, SyncSummary };

// Global state
const managerState: SyncManagerState = {
  state: SyncState.OFFLINE,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : false,
  queuedCount: 0,
};

// Callbacks
type StateChangeCallback = (state: SyncManagerState) => void;
const stateChangeCallbacks: Set<StateChangeCallback> = new Set();

// Cleanup
let unsubscribeFromQueue: (() => void) | null = null;
let syncRetryTimeout: ReturnType<typeof setTimeout> | null = null;
let isInitialized = false;

// Retry configuration
const BASE_RETRY_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 120000;
let retryCount = 0;

/**
 * Initialize the sync manager.
 * Must be called once during app startup.
 */
export function initializeSyncManager(): void {
  if (isInitialized) {
    return;
  }

  isInitialized = true;

  updateIsOnline(navigator.onLine);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  unsubscribeFromQueue = subscribeToQueueChanges(() => {
    updateQueuedCount();
  });

  updateQueuedCount();
  notifyStateChange();
}

function handleOnline(): void {
  updateIsOnline(true);
  void triggerSync();
}

function handleOffline(): void {
  updateIsOnline(false);
}

/**
 * Cleanup sync manager resources.
 * Must be called on app unmount.
 */
export function cleanupSyncManager(): void {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);

  if (unsubscribeFromQueue) {
    unsubscribeFromQueue();
    unsubscribeFromQueue = null;
  }

  if (syncRetryTimeout) {
    clearTimeout(syncRetryTimeout);
    syncRetryTimeout = null;
  }

  retryCount = 0;
  isInitialized = false;
}

function updateIsOnline(online: boolean): void {
  managerState.isOnline = online;
  managerState.state = online ? SyncState.ONLINE : SyncState.OFFLINE;
  notifyStateChange();
}

function updateQueuedCount(): void {
  managerState.queuedCount = getQueuedItemCount();
  notifyStateChange();
}

function notifyStateChange(): void {
  stateChangeCallbacks.forEach((callback) => {
    try {
      callback({ ...managerState });
    } catch (error) {
      console.error('[SyncManager] Error in state change callback:', error);
    }
  });
}

let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 2000;

export async function triggerSync(): Promise<void> {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  if (managerState.queuedCount === 0) {
    return;
  }

  if (managerState.state === SyncState.SYNCING) {
    return;
  }

  syncDebounceTimer = setTimeout(() => {
    void performSync();
  }, SYNC_DEBOUNCE_MS);
}

async function performSync(): Promise<void> {
  if (!managerState.isOnline) {
    return;
  }

  managerState.state = SyncState.SYNCING;
  notifyStateChange();

  try {
    const summary = await syncOfflineQueue();

    managerState.lastSyncTime = new Date();
    managerState.lastSyncSummary = summary;
    managerState.error = undefined;
    retryCount = 0;

    updateQueuedCount();
    managerState.state = SyncState.ONLINE;
  } catch (error) {
    console.error('[SyncManager] Sync failed:', error);

    managerState.state = SyncState.ERROR;
    managerState.error = error instanceof Error ? error : new Error(String(error));

    scheduleRetry();
  }

  notifyStateChange();
}

function scheduleRetry(): void {
  if (syncRetryTimeout) {
    clearTimeout(syncRetryTimeout);
  }

  const delayMs = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryCount), MAX_RETRY_DELAY_MS);
  retryCount++;

  syncRetryTimeout = setTimeout(() => {
    if (managerState.isOnline) {
      void triggerSync();
    }
  }, delayMs);
}

export function getSyncState(): Readonly<SyncManagerState> {
  return { ...managerState };
}

export function isOnline(): boolean {
  return managerState.isOnline;
}

export function subscribeSyncState(callback: StateChangeCallback): () => void {
  stateChangeCallbacks.add(callback);

  return () => {
    stateChangeCallbacks.delete(callback);
  };
}

export function getStatusMessage(): string {
  switch (managerState.state) {
    case SyncState.ONLINE:
      return managerState.queuedCount > 0 ? `${managerState.queuedCount} item(s) synced` : 'Online';
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
}

export function getStatusSeverity(): 'success' | 'warning' | 'error' | 'info' {
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
}

export async function retrySync(): Promise<void> {
  if (syncRetryTimeout) {
    clearTimeout(syncRetryTimeout);
    syncRetryTimeout = null;
  }

  await performSync();
}
