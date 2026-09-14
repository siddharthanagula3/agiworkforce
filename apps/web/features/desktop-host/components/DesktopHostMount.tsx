'use client';

import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { useDesktopAccount } from '../hooks/use-desktop-account';
import { useDesktopDeepLinks } from '../hooks/use-desktop-deep-links';
import { useDesktopExternalLinks } from '../hooks/use-desktop-external-links';
import { useHostCommands } from '../hooks/use-host-commands';
import { useWindowZoom } from '../hooks/use-window-zoom';
import { useDesktopHost } from '../lib/host';
import { DesktopTitleStrip } from './DesktopTitleStrip';

function DesktopHostBehaviour({ host }: { host: HostBridge }) {
  useDesktopAccount(host);
  useDesktopDeepLinks();
  useDesktopExternalLinks(host);
  useHostCommands(host);
  useWindowZoom(host);
  return <DesktopTitleStrip />;
}

export function DesktopHostMount() {
  const host = useDesktopHost();
  return host ? <DesktopHostBehaviour host={host} /> : null;
}
