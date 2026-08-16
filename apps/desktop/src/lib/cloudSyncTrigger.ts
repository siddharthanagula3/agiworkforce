
import { invoke } from './tauri-mock';
import { useAppModeStore, selectPrivacyMode } from '../stores/appModeStore';
import { selectHasCloudAccountSession, useUnifiedAuthStore } from '../stores/auth';

const SYNC_INTERVAL_MS = 30_000;

function getCurrentUserId(): string | null {
  try {
    const auth = useUnifiedAuthStore.getState();
    if (!selectHasCloudAccountSession(auth)) return null;
    return auth.user?.id ?? null;
  } catch {
    return null;
  }
}

function isManagedMode(): boolean {
  try {
    return selectPrivacyMode(useAppModeStore.getState()) === 'managed';
  } catch {
    return false;
  }
}

export function triggerCloudSync(): void {
  if (!isManagedMode()) return;

  const userId = getCurrentUserId();
  if (!userId) return;

  void invoke('sync_conversations_to_cloud', { userId }).catch((err: unknown) => {
    console.warn('[cloudSyncTrigger] sync failed:', err);
  });
}

let postTurnDebounceHandle: ReturnType<typeof setTimeout> | null = null;

export function triggerCloudSyncAfterTurn(): void {
  if (postTurnDebounceHandle !== null) {
    clearTimeout(postTurnDebounceHandle);
  }
  postTurnDebounceHandle = setTimeout(() => {
    postTurnDebounceHandle = null;
    triggerCloudSync();
  }, 3_000);
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let modeUnsubscribe: (() => void) | null = null;

function startInterval(): void {
  if (intervalHandle !== null) return;
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

export function initCloudSyncScheduler(): () => void {
  if (isManagedMode()) {
    triggerCloudSync();
    startInterval();
  }

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
