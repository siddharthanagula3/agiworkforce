'use client';

import dynamic from 'next/dynamic';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { useComputerUseRunEnd } from '../hooks/use-computer-use';
import { useDesktopAccount } from '../hooks/use-desktop-account';
import { useDesktopDeepLinks } from '../hooks/use-desktop-deep-links';
import { useDeviceHeartbeat } from '../hooks/use-device-heartbeat';
import { useDesktopExternalLinks } from '../hooks/use-desktop-external-links';
import { useAdjacentChat } from '../hooks/use-adjacent-chat';
import { useOpenChatTabs } from '../hooks/use-open-chat-tabs';
import { useTemporaryChat } from '../hooks/use-temporary-chat';
import { useHostCommands } from '../hooks/use-host-commands';
import { useRemotePairingRefresh } from '../hooks/use-remote-pairing-refresh';
import { useShellLayout } from '../hooks/use-shell-layout';
import { useWindowZoom } from '../hooks/use-window-zoom';
import { useDesktopHost } from '../lib/host';
import { BrowserHandoffNotice } from './BrowserHandoffNotice';
import { ComputerUseControlBar } from './ComputerUseControlBar';
import { DesktopChanges } from './DesktopChanges';
import { DesktopChatTabs } from './DesktopChatTabs';
import { DesktopTitleStrip } from './DesktopTitleStrip';
import { DesktopUpdateNotice } from './DesktopUpdateNotice';
import { OpenedFolderNotice } from './OpenedFolderNotice';
import { PageFindBar } from './PageFindBar';
import { SideChatPane } from './SideChatPane';

const DesktopChatRunner = dynamic(
  () => import('./DesktopChatRunner').then((module) => module.DesktopChatRunner),
  { ssr: false },
);

function DesktopHostBehaviour({ host }: { host: HostBridge }) {
  useDesktopAccount(host);
  useDeviceHeartbeat(host);
  useDesktopDeepLinks();
  useDesktopExternalLinks(host);
  useHostCommands(host);
  useAdjacentChat();
  useOpenChatTabs();
  useTemporaryChat();
  useRemotePairingRefresh(host);
  useShellLayout(host);
  useWindowZoom(host);
  useComputerUseRunEnd(host);
  return (
    <>
      <DesktopTitleStrip />
      <DesktopChatTabs />
      <DesktopChanges />
      {host.shell === 'electron' ? <DesktopChatRunner host={host} /> : null}
      <PageFindBar />
      <SideChatPane />
      <div className="pointer-events-none fixed left-1/2 top-3 z-[var(--z-popover)] flex w-[min(92vw,560px)] -translate-x-1/2 flex-col gap-2">
        <ComputerUseControlBar />
        <DesktopUpdateNotice host={host} />
        <BrowserHandoffNotice />
        <OpenedFolderNotice />
      </div>
    </>
  );
}

export function DesktopHostMount() {
  const host = useDesktopHost();
  return host ? <DesktopHostBehaviour host={host} /> : null;
}
