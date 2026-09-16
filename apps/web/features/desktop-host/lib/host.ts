'use client';

import { useSyncExternalStore } from 'react';
import {
  getHostBridge,
  hostHasLocalMode,
  type HostBridge,
} from '@agiworkforce/local-runtime-contract';

function subscribe(): () => void {
  return () => undefined;
}

function readHost(): HostBridge | null {
  return getHostBridge();
}

function readServerHost(): HostBridge | null {
  return null;
}

/**
 * The desktop shell's bridge, or null in a browser.
 *
 * The preload injects `window.agiHost` before the document exists, so the
 * value never changes after hydration and the store needs no subscription.
 * The server snapshot is null, which is what keeps every desktop-only control
 * out of the server-rendered markup rather than flashing it and removing it.
 */
export function useDesktopHost(): HostBridge | null {
  return useSyncExternalStore(subscribe, readHost, readServerHost);
}

export function isDesktopHost(): boolean {
  return getHostBridge() !== null;
}

/**
 * The bridge, but only from a shell that has a Local mode.
 *
 * Every on-device surface hangs off this rather than off `useDesktopHost`:
 * AGI Cloud is Electron and answers in the cloud, so under it there is no
 * model to list, no server address to edit and no local runtime to grant.
 */
export function useLocalModeHost(): HostBridge | null {
  const host = useDesktopHost();
  return hostHasLocalMode(host) ? host : null;
}

export function isLocalModeHost(): boolean {
  return hostHasLocalMode(getHostBridge());
}
