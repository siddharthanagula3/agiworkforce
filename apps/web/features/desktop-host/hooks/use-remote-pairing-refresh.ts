'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { settingsSectionPath } from '@/features/settings/lib/web-settings-sections';
import { refreshRemotePairing } from '../lib/remote-pairing';
import { readRemoteControl } from '../lib/runtime-client';

const REFRESH_FAILED =
  "Couldn't refresh the pairing code. Open Settings > Remote Control to try again.";

export function useRemotePairingRefresh(host: HostBridge): void {
  const router = useRouter();

  useEffect(() => {
    let running = false;
    return host.onRuntimeEvent((event) => {
      if (event.kind !== 'remote-control-refresh-requested' || running) return;
      running = true;
      readRemoteControl()
        .then((state) => (state.status === 'waiting' ? refreshRemotePairing() : null))
        .catch(() => {
          toast.error(REFRESH_FAILED, {
            action: {
              label: 'Open settings',
              onClick: () => router.push(settingsSectionPath('capabilities')),
            },
          });
        })
        .finally(() => {
          running = false;
        });
    });
  }, [host, router]);
}
