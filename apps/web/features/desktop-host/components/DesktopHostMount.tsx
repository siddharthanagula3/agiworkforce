'use client';

import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { useDesktopAccount } from '../hooks/use-desktop-account';
import { useDesktopDeepLinks } from '../hooks/use-desktop-deep-links';
import { useDeviceHeartbeat } from '../hooks/use-device-heartbeat';
import { useDesktopExternalLinks } from '../hooks/use-desktop-external-links';
import { useHostCommands } from '../hooks/use-host-commands';
import { useShellLayout } from '../hooks/use-shell-layout';
import { useWindowZoom } from '../hooks/use-window-zoom';
import { useDesktopHost } from '../lib/host';
import { DesktopTitleStrip } from './DesktopTitleStrip';
import { DesktopUpdateNotice } from './DesktopUpdateNotice';

function DesktopHostBehaviour({ host }: { host: HostBridge }) {
  useDesktopAccount(host);
  useDeviceHeartbeat(host);
  useDesktopDeepLinks();
  useDesktopExternalLinks(host);
  useHostCommands(host);
  useShellLayout(host);
  useWindowZoom(host);
  return (
    <>
      <DesktopTitleStrip />
      <DesktopUpdateNotice host={host} />
    </>
  );
}

export function DesktopHostMount() {
  const host = useDesktopHost();
  return host ? <DesktopHostBehaviour host={host} /> : null;
}
