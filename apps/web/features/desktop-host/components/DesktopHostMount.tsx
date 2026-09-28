'use client';

import dynamic from 'next/dynamic';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { useComputerUseRunEnd } from '../hooks/use-computer-use';
import { useDesktopAccount } from '../hooks/use-desktop-account';
import { useDesktopDeepLinks } from '../hooks/use-desktop-deep-links';
import { useDeviceHeartbeat } from '../hooks/use-device-heartbeat';
import { useDesktopExternalLinks } from '../hooks/use-desktop-external-links';
import { useHostCommands } from '../hooks/use-host-commands';
import { useShellLayout } from '../hooks/use-shell-layout';
import { useWindowZoom } from '../hooks/use-window-zoom';
import { useDesktopHost } from '../lib/host';
import { ComputerUseControlBar } from './ComputerUseControlBar';
import { DesktopTitleStrip } from './DesktopTitleStrip';
import { DesktopUpdateNotice } from './DesktopUpdateNotice';

const DispatchTaskRunner = dynamic(
  () => import('./DispatchTaskRunner').then((module) => module.DispatchTaskRunner),
  { ssr: false },
);

function DesktopHostBehaviour({ host }: { host: HostBridge }) {
  useDesktopAccount(host);
  useDeviceHeartbeat(host);
  useDesktopDeepLinks();
  useDesktopExternalLinks(host);
  useHostCommands(host);
  useShellLayout(host);
  useWindowZoom(host);
  useComputerUseRunEnd(host);
  return (
    <>
      <DesktopTitleStrip />
      {host.shell === 'electron' ? <DispatchTaskRunner host={host} /> : null}
      <div className="pointer-events-none fixed left-1/2 top-3 z-[var(--z-popover)] flex w-[min(92vw,560px)] -translate-x-1/2 flex-col gap-2">
        <ComputerUseControlBar />
        <DesktopUpdateNotice host={host} />
      </div>
    </>
  );
}

export function DesktopHostMount() {
  const host = useDesktopHost();
  return host ? <DesktopHostBehaviour host={host} /> : null;
}
