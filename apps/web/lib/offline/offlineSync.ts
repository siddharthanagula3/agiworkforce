/**
 * Offline Sync Manager
 *
 * Higher-level orchestration for offline queue synchronization.
 * Monitors network connectivity and triggers syncs appropriately.
 *
 * Features:
 * - Automatic online/offline detection
 * - Debounced sync on connectivity restored
 * - Periodic retry for failed items
 * - Global sync state management
 */

import { syncOfflineQueue, getQueuedItemCount, subscribeToQueueChanges } from './offlineQueue';
import type { SyncManagerState, SyncSummary } from '@agiworkforce/types';
import { SyncState } from '@agiworkforce/types';

// Re-export for backward compatibility
export { SyncState };
export type { SyncManagerState, SyncSummary };

// Use the imported enum internally
const SyncStateEnum = SyncState;

// Global state
const managerState: SyncManagerState = {
  state: SyncStateEnum.OFFLINE,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : false,
  queuedCount: 0,
};

// Callbacks
type StateChangeCallback = (state: SyncManagerState) => void;
const stateChangeCallbacks: Set<StateChangeCallback> = new Set();

// Cleanup
let unsubscribeFromQueue: (() => void) | null = null;
let syncRetryTimeout: NodeJS.Timeout | null = null;
let isInitialized = false;

/**
 * Initialize the sync manager
 * Must be called once during app startup
 */
export function initializeSyncManager(): void {
  if (isInitialized) {
    return;
  }

  isInitialized = true;

  // Set initial online state
  updateIsOnline(navigator.onLine);

  // Listen for online/offline events
  window.addEventListener('online', () => {
    updateIsOnline(true);
    triggerSync(); // Sync immediately when coming online
  });

  window.addEventListener('offline', () => {
    updateIsOnline(false);
  });

  // Subscribe to queue changes
  unsubscribeFromQueue = subscribeToQueueChanges(() => {
    updateQueuedCount();
  });

  // Update initial queued count
  updateQueuedCount();

  notifyStateChange();
}

/**
 * Cleanup sync manager resources
 */
export function cleanupSyncManager(): void {
  if (unsubscribeFromQueue) {
    unsubscribeFromQueue();
    unsubscribeFromQueue = null;
  }

  if (syncRetryTimeout) {
    clearTimeout(syncRetryTimeout);
    syncRetryTimeout = null;
  }

  isInitialized = false;
}

/**
 * Update online/offline state
 */
function updateIsOnline(isOnline: boolean): void {
  managerState.isOnline = isOnline;
  managerState.state = isOnline ? SyncStateEnum.ONLINE : SyncStateEnum.OFFLINE;
  notifyStateChange();
}

/**
 * Update queued item count
 */
function updateQueuedCount(): void {
  managerState.queuedCount = getQueuedItemCount();
  notifyStateChange();
}

/**
 * Notify all subscribers of state change
 */
function notifyStateChange(): void {
  stateChangeCallbacks.forEach((callback) => {
    try {
      callback({ ...managerState });
    } catch (error) {
      console.error('[SyncManager] Error in state change callback:', error);
    }
  });
}

/**
 * Debounce timer for sync
 */
let syncDebounceTimer: NodeJS.Timeout | null = null;
const SYNC_DEBOUNCE_MS = 2000; // Wait 2s after coming online before syncing

/**
 * Trigger a sync operation (debounced)
 */
export async function triggerSync(): Promise<void> {
  // Clear any pending sync
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  // If no items queued, skip
  if (managerState.queuedCount === 0) {
    return;
  }

  // If already syncing, skip
  if (managerState.state === SyncStateEnum.SYNCING) {
    return;
  }

  // Debounce the actual sync
  syncDebounceTimer = setTimeout(async () => {
    await performSync();
  }, SYNC_DEBOUNCE_MS);
}

/**
 * Perform actual sync operation
 */
async function performSync(): Promise<void> {
  if (!managerState.isOnline) {
    return;
  }

  // Update state to syncing
  managerState.state = SyncStateEnum.SYNCING;
  notifyStateChange();

  try {
    // Note: The actual sync callbacks would be provided by the chat store
    // This just performs the queue sync without callbacks
    // The callbacks are wired in the chat store integration layer

    const summary = await syncOfflineQueue();

    managerState.lastSyncTime = new Date();
    managerState.lastSyncSummary = summary;
    managerState.error = undefined;

    // Update state based on sync result
    updateQueuedCount();
    managerState.state = managerState.queuedCount > 0 ? SyncStateEnum.ONLINE : SyncStateEnum.ONLINE;
  } catch (error) {
    console.error('[SyncManager] Sync failed:', error);

    managerState.state = SyncStateEnum.ERROR;
    managerState.error = error instanceof Error ? error : new Error(String(error));

    // Schedule retry
    scheduleRetry();
  }

  notifyStateChange();
}

/**
 * Schedule a retry for failed sync
 */
function scheduleRetry(): void {
  if (syncRetryTimeout) {
    clearTimeout(syncRetryTimeout);
  }

  // Exponential backoff: 5s, 10s, 30s, 60s, 120s
  const delayMs = Math.min(5000 * Math.pow(2, 3), 120000);

  syncRetryTimeout = setTimeout(() => {
    if (managerState.isOnline) {
      triggerSync();
    }
  }, delayMs);
}

/**
 * Get current sync manager state
 */
export function getSyncState(): Readonly<SyncManagerState> {
  return { ...managerState };
}

/**
 * Check if currently online
 */
export function isOnline(): boolean {
  return managerState.isOnline;
}

/**
 * Subscribe to sync state changes
 * Returns unsubscribe function
 */
export function subscribeSyncState(callback: StateChangeCallback): () => void {
  stateChangeCallbacks.add(callback);

  return () => {
    stateChangeCallbacks.delete(callback);
  };
}

/**
 * Get formatted status message for UI
 */
export function getStatusMessage(): string {
  switch (managerState.state) {
    case SyncStateEnum.ONLINE:
      return managerState.queuedCount > 0 ? `${managerState.queuedCount} item(s) synced` : 'Online';
    case SyncStateEnum.OFFLINE:
      return managerState.queuedCount > 0
        ? `Offline - ${managerState.queuedCount} pending`
        : 'Offline';
    case SyncStateEnum.SYNCING:
      return 'Syncing...';
    case SyncStateEnum.ERROR:
      return 'Sync failed - will retry';
    default:
      return 'Unknown';
  }
}

/**
 * Get color/severity for status indicator
 */
export function getStatusSeverity(): 'success' | 'warning' | 'error' | 'info' {
  switch (managerState.state) {
    case SyncStateEnum.ONLINE:
      return managerState.queuedCount > 0 ? 'info' : 'success';
    case SyncStateEnum.OFFLINE:
      return managerState.queuedCount > 0 ? 'warning' : 'info';
    case SyncStateEnum.SYNCING:
      return 'info';
    case SyncStateEnum.ERROR:
      return 'error';
    default:
      return 'info';
  }
}

/**
 * Manually retry failed items
 */
export async function retrySync(): Promise<void> {
  if (syncRetryTimeout) {
    clearTimeout(syncRetryTimeout);
    syncRetryTimeout = null;
  }

  await performSync();
}
