import { useEffect } from 'react';
import { create } from 'zustand';
import type { BrowserActivityEventDetail } from '@agiworkforce/types';

const DEFAULT_BROWSER_ACTIVITY: BrowserActivityEventDetail = {
  active: false,
  url: '',
  title: null,
  status: 'idle',
  lastAction: null,
  extensionConnected: false,
  hasError: false,
};

interface BrowserActivityStore {
  detail: BrowserActivityEventDetail;
  setDetail: (detail: BrowserActivityEventDetail) => void;
  reset: () => void;
}

export const useBrowserActivityStore = create<BrowserActivityStore>((set) => ({
  detail: DEFAULT_BROWSER_ACTIVITY,
  setDetail: (detail) => set({ detail: { ...DEFAULT_BROWSER_ACTIVITY, ...detail } }),
  reset: () => set({ detail: DEFAULT_BROWSER_ACTIVITY }),
}));

let isBrowserActivityListenerInitialized = false;

export function initializeBrowserActivityListener(): void {
  if (isBrowserActivityListenerInitialized || typeof window === 'undefined') {
    return;
  }

  const handle = (event: Event) => {
    const detail = (event as CustomEvent<BrowserActivityEventDetail>).detail;
    useBrowserActivityStore.getState().setDetail(detail);
  };

  window.addEventListener('agi:browser-active', handle);
  isBrowserActivityListenerInitialized = true;
}

export function emitBrowserActivity(detail: BrowserActivityEventDetail): void {
  const nextDetail = { ...DEFAULT_BROWSER_ACTIVITY, ...detail };
  useBrowserActivityStore.getState().setDetail(nextDetail);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<BrowserActivityEventDetail>('agi:browser-active', { detail: nextDetail }),
    );
  }
}

export function useBrowserActivity(): BrowserActivityEventDetail {
  const detail = useBrowserActivityStore((state) => state.detail);

  useEffect(() => {
    initializeBrowserActivityListener();
  }, []);

  return detail;
}

export function focusBrowserActivity(
  url: string,
  title?: string | null,
  lastAction?: string,
): void {
  emitBrowserActivity({
    active: true,
    url,
    title: title ?? null,
    status: 'done',
    lastAction: lastAction ?? 'Viewing source',
    extensionConnected: false,
    hasError: false,
  });
}
