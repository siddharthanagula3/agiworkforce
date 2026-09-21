import { useEffect } from 'react';
import { AppState } from 'react-native';
import { deviceStatusMetrics, heartbeatRetryDelayMs, sendMobileHeartbeat } from './heartbeat';

export function useDeviceRegistryHeartbeat(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function schedule(delayMs: number): void {
      if (stopped) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(beat, delayMs);
    }

    function beat(): void {
      if (AppState.currentState !== 'active') {
        schedule(heartbeatRetryDelayMs(0));
        return;
      }
      void sendMobileHeartbeat()
        .catch(() => false)
        .then(() => schedule(heartbeatRetryDelayMs(deviceStatusMetrics().consecutiveFailures)));
    }

    beat();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') beat();
    });
    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      subscription.remove();
    };
  }, []);
}
