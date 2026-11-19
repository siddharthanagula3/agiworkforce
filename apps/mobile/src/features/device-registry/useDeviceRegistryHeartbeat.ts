import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { settleAskIntentOnLaunch } from '@/src/features/siri/askIntentToken';
import {
  clearHeartbeatFailureStreak,
  deviceStatusMetrics,
  heartbeatRetryDelayMs,
  sendMobileHeartbeat,
} from './heartbeat';

function inCloudMode(): boolean {
  return useChatAppModeStore.getState().appMode === 'cloud';
}

export function useDeviceRegistryHeartbeat(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function cancel(): void {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    }

    function schedule(delayMs: number): void {
      if (stopped) return;
      cancel();
      timer = setTimeout(beat, delayMs);
    }

    function beat(): void {
      if (stopped) return;
      if (!inCloudMode()) {
        cancel();
        return;
      }
      if (AppState.currentState !== 'active') {
        schedule(heartbeatRetryDelayMs(0));
        return;
      }
      void sendMobileHeartbeat()
        .catch(() => false)
        .then((accepted) => {
          if (accepted) {
            settleAskIntentOnLaunch().catch((error: unknown) => {
              console.warn('[siri] the Ask from Siri token was not rotated', error);
            });
          }
        })
        .then(() => schedule(heartbeatRetryDelayMs(deviceStatusMetrics().consecutiveFailures)));
    }

    beat();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') beat();
    });
    const stopModeWatch = useChatAppModeStore.subscribe((state, previous) => {
      if (state.appMode === previous.appMode) return;
      if (state.appMode !== 'cloud') {
        cancel();
        return;
      }
      clearHeartbeatFailureStreak();
      beat();
    });
    return () => {
      stopped = true;
      cancel();
      subscription.remove();
      stopModeWatch();
    };
  }, []);
}
