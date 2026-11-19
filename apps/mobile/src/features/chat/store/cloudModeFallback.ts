import { recordedCloudAccountOwnerId } from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from './appModeStore';

let sessionAnswered = false;
let fallbackOwnerId: string | null = null;
let stopWatchingModeChoice: (() => void) | null = null;

function forgetFallback(): void {
  stopWatchingModeChoice?.();
  stopWatchingModeChoice = null;
  fallbackOwnerId = null;
}

// Any later write to the mode store, the same value included, is someone
// choosing a mode, so it retires the fallback before it can be undone.
export function fallBackToLocalMode(): void {
  forgetFallback();
  useChatAppModeStore.getState().setAppMode('local');
  const ownerId = sessionAnswered ? null : recordedCloudAccountOwnerId();
  if (!ownerId) return;
  fallbackOwnerId = ownerId;
  stopWatchingModeChoice = useChatAppModeStore.subscribe(forgetFallback);
}

export function answerCloudSession(confirmedUserId: string | null): void {
  sessionAnswered = true;
  const restore = confirmedUserId !== null && fallbackOwnerId === confirmedUserId;
  forgetFallback();
  if (restore) useChatAppModeStore.getState().setAppMode('cloud');
}

export function __resetCloudModeFallbackForTests(): void {
  forgetFallback();
  sessionAnswered = false;
}
