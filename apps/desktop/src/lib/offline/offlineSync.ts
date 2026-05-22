/**
 * Offline Sync Manager (Desktop wrapper)
 *
 * Desktop-surface binding of the shared
 * `@agiworkforce/runtime/offline-sync` factory. Wires the canonical
 * `OfflineSyncManager` to the desktop offline queue, real Tauri-webview
 * `window` online/offline events, and `navigator.onLine`.
 *
 * The previous standalone implementation lived in this file and was
 * copy-ported from `apps/web/lib/offline/offlineSync.ts`. Both surfaces
 * now share the canonical factory; only adapters differ.
 */

import { createOfflineSyncManager } from '@agiworkforce/runtime/offline-sync';
import { syncOfflineQueue, getQueuedItemCount, subscribeToQueueChanges } from './offlineQueue';
import type { SyncManagerState, SyncSummary } from '@agiworkforce/types';
import { SyncState } from '@agiworkforce/types';

export { SyncState };
export type { SyncManagerState, SyncSummary };

const manager = createOfflineSyncManager({
  queue: {
    syncOfflineQueue,
    getQueuedItemCount,
    subscribeToQueueChanges,
  },
});

export function initializeSyncManager(): void {
  manager.initialize();
}

export function cleanupSyncManager(): void {
  manager.cleanup();
}

export function triggerSync(): Promise<void> {
  return manager.triggerSync();
}

export function retrySync(): Promise<void> {
  return manager.retrySync();
}

export function getSyncState(): Readonly<SyncManagerState> {
  return manager.getState();
}

export function isOnline(): boolean {
  return manager.isOnline();
}

export function subscribeSyncState(callback: (state: SyncManagerState) => void): () => void {
  return manager.subscribeState(callback);
}

export function getStatusMessage(): string {
  return manager.getStatusMessage();
}

export function getStatusSeverity(): 'success' | 'warning' | 'error' | 'info' {
  return manager.getStatusSeverity();
}
