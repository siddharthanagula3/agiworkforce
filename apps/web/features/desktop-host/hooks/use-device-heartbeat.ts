'use client';

import { useEffect } from 'react';
import { DEVICE_HEARTBEAT_INTERVAL_MS } from '@agiworkforce/cloud-contracts';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { useCurrentUser } from '@/lib/identity/client';
import { sendDesktopHeartbeat } from '../lib/device-heartbeat';

export function useDeviceHeartbeat(host: HostBridge | null): void {
  const { isLoaded, isSignedIn } = useCurrentUser();

  useEffect(() => {
    if (!host || !isLoaded || !isSignedIn) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const beat = async () => {
      await sendDesktopHeartbeat(host).catch(() => false);
      if (!cancelled) timer = setTimeout(() => void beat(), DEVICE_HEARTBEAT_INTERVAL_MS);
    };

    void beat();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [host, isLoaded, isSignedIn]);
}
