import { useEffect } from 'react';
import { AppState } from 'react-native';
import { DEVICE_HEARTBEAT_INTERVAL_MS } from '@agiworkforce/cloud-contracts';
import { sendMobileHeartbeat } from './heartbeat';

export function useDeviceRegistryHeartbeat(): void {
  useEffect(() => {
    const beat = () => {
      if (AppState.currentState === 'active') void sendMobileHeartbeat().catch(() => false);
    };
    beat();
    const timer = setInterval(beat, DEVICE_HEARTBEAT_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') beat();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
}
