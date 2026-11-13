'use client';

import {
  getHostBridge,
  type BrowserPaneBounds,
  type BrowserPaneCapture,
  type BrowserPaneHistoryAction,
  type BrowserPaneState,
} from '@agiworkforce/local-runtime-contract';
import { invokeDesktopRuntime } from './runtime-client';

export function readBrowserPane(paneId: string): Promise<BrowserPaneState> {
  return invokeDesktopRuntime<BrowserPaneState>('browser_pane_state', { paneId });
}

export function layoutBrowserPane(
  paneId: string,
  bounds: BrowserPaneBounds,
  visible: boolean,
): Promise<boolean> {
  return invokeDesktopRuntime<boolean>('browser_pane_layout', { paneId, bounds, visible });
}

export function openBrowserPaneTab(paneId: string, url?: string): Promise<BrowserPaneState> {
  return invokeDesktopRuntime<BrowserPaneState>('browser_pane_open_tab', {
    paneId,
    ...(url ? { url } : {}),
  });
}

export function closeBrowserPaneTab(paneId: string, tabId: string): Promise<BrowserPaneState> {
  return invokeDesktopRuntime<BrowserPaneState>('browser_pane_close_tab', { paneId, tabId });
}

export function selectBrowserPaneTab(paneId: string, tabId: string): Promise<BrowserPaneState> {
  return invokeDesktopRuntime<BrowserPaneState>('browser_pane_select_tab', { paneId, tabId });
}

export function navigateBrowserPane(paneId: string, url: string): Promise<BrowserPaneState> {
  return invokeDesktopRuntime<BrowserPaneState>('browser_pane_navigate', { paneId, url });
}

export function moveBrowserPaneHistory(
  paneId: string,
  action: BrowserPaneHistoryAction,
): Promise<BrowserPaneState> {
  return invokeDesktopRuntime<BrowserPaneState>('browser_pane_history', { paneId, action });
}

export function captureBrowserPane(paneId: string): Promise<BrowserPaneCapture> {
  return invokeDesktopRuntime<BrowserPaneCapture>('browser_pane_capture', { paneId });
}

export function closeBrowserPane(paneId: string): Promise<boolean> {
  return invokeDesktopRuntime<boolean>('browser_pane_close', { paneId });
}

export function onBrowserPaneChanged(
  paneId: string,
  listener: (state: BrowserPaneState) => void,
): () => void {
  const host = getHostBridge();
  if (!host) return () => undefined;
  return host.onRuntimeEvent((event) => {
    if (event.kind === 'browser-pane-changed' && event.paneId === paneId) listener(event.state);
  });
}
