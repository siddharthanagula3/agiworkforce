'use client';

import { useEffect } from 'react';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { refreshRemotePairing } from '../lib/remote-pairing';
import { readRemoteControl } from '../lib/runtime-client';

export function useRemotePairingRefresh(host: HostBridge): void {
  useEffect(() => {
    let running = false;
    return host.onRuntimeEvent((event) => {
      if (event.kind !== 'remote-control-refresh-requested' || running) return;
      running = true;
      readRemoteControl()
        .then((state) => (state.status === 'waiting' ? refreshRemotePairing() : null))
        .catch(() => null)
        .finally(() => {
          running = false;
        });
    });
  }, [host]);
}
