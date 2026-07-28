/**
 * Cloud Sync Trigger
 *
 * Wires the three auto-trigger points for the cloud sync engine:
 *   1. On entry into managed/cloud mode (mode-transition subscription)
 *   2. After a cloud chat turn completes (called from TauriRuntime.sendMessage)
 *   3. Periodic ~30 s interval while in managed mode; cleared on leaving or sign-out
 *
 * MANAGED-ONLY gate: mirrors egressGuard's exact logic.
 *   selectPrivacyMode(useAppModeStore.getState()) === 'managed'
 *
 * BYOK conversations live inside the Local workspace and must NEVER trigger
 * sync. The canonical privacy-mode check is the safe discriminator.
 *
 * FAIL-CLOSED: any error reading the store or auth state is treated as
 * non-managed and sync is skipped.
 */

import { invoke } from './tauri-mock';
import { useAppModeStore, selectPrivacyMode } from '../stores/appModeStore';
import { selectHasCloudAccountSession, useUnifiedAuthStore } from '../stores/auth';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SYNC_INTERVAL_MS = 30_000;

/** Returns the Cloud account owner only when a validated bearer is present. */
function getCurrentUserId(): string | null {
  try {
    const auth = useUnifiedAuthStore.getState();
    if (!selectHasCloudAccountSession(auth)) return null;
    return auth.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns true only when the current session is in AGI-managed cloud mode.
 * Fail-closed: any exception → false.
 */
function isManagedMode(): boolean {
  try {
    return selectPrivacyMode(useAppModeStore.getState()) === 'managed';
  } catch {
    return false;
  }
}

/**
 * Fire a single sync cycle — fire-and-forget, never throws.
 * Re-checks the gate and userId at the moment of each call.
 */
export function triggerCloudSync(): void {
  if (!isManagedMode()) return;

  const userId = getCurrentUserId();
  if (!userId) return;

  void invoke('sync_conversations_to_cloud', { userId }).catch((err: unknown) => {
    console.warn('[cloudSyncTrigger] sync failed:', err);
  });
}

// Debounce handle for the post-turn trigger (hook 2).
let postTurnDebounceHandle: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced post-turn trigger. Called from TauriRuntime.sendMessage after
 * the streaming loop completes. Coalesces rapid follow-up turns within 3 s.
 */
export function triggerCloudSyncAfterTurn(): void {
  if (postTurnDebounceHandle !== null) {
    clearTimeout(postTurnDebounceHandle);
  }
  postTurnDebounceHandle = setTimeout(() => {
    postTurnDebounceHandle = null;
    triggerCloudSync();
  }, 3_000);
}

// ---------------------------------------------------------------------------
// Scheduler (hooks 1 + 3) — call initCloudSyncScheduler() once at app startup
// ---------------------------------------------------------------------------

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let modeUnsubscribe: (() => void) | null = null;

function startInterval(): void {
  if (intervalHandle !== null) return; // already running
  intervalHandle = setInterval(() => {
    triggerCloudSync();
  }, SYNC_INTERVAL_MS);
}

function stopInterval(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

/**
 * Initialize the cloud sync scheduler. Must be called once at app startup
 * (Tauri-only). Returns a cleanup function to stop the scheduler on unmount
 * or sign-out.
 *
 * Subscribes to appModeStore privacy mode changes:
 *   - On transition TO 'managed': fire immediate sync + start 30 s interval
 *   - On transition AWAY from 'managed': stop interval
 */
export function initCloudSyncScheduler(): () => void {
  // If already in managed mode on startup, start immediately.
  if (isManagedMode()) {
    triggerCloudSync();
    startInterval();
  }

  // Subscribe to future mode transitions.
  modeUnsubscribe = useAppModeStore.subscribe(
    (state) => selectPrivacyMode(state),
    (privacyMode) => {
      if (privacyMode === 'managed') {
        triggerCloudSync();
        startInterval();
      } else {
        stopInterval();
      }
    },
  );

  return () => {
    stopInterval();
    if (postTurnDebounceHandle !== null) {
      clearTimeout(postTurnDebounceHandle);
      postTurnDebounceHandle = null;
    }
    if (modeUnsubscribe) {
      modeUnsubscribe();
      modeUnsubscribe = null;
    }
  };
}
