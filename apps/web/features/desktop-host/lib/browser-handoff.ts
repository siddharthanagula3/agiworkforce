'use client';

import { useSyncExternalStore } from 'react';
import { getHostBridge } from '@agiworkforce/local-runtime-contract';

/**
 * A step the desktop shell hands to the user's browser on purpose: a payment
 * page or a provider's sign-in the app window does not host. The window keeps
 * its place, says where the step went, and rereads what the step changes each
 * time the user comes back to it.
 */
export interface BrowserHandoff {
  /** What opened in the browser, as a sentence. */
  detail: string;
  /** Reread what the browser step changes. Runs when the window regains focus. */
  refresh: () => void | Promise<void>;
}

/**
 * `navigated` in a browser, where the page itself goes to the address and the
 * caller's pending state never needs clearing. `handed-off` in the shell,
 * where this page stays and the caller is still on screen.
 */
export type BrowserHandoffOutcome = 'navigated' | 'handed-off';

let current: BrowserHandoff | null = null;
const listeners = new Set<() => void>();

function publish(next: BrowserHandoff | null): void {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(): BrowserHandoff | null {
  return current;
}

function readOnServer(): BrowserHandoff | null {
  return null;
}

export function continueInBrowser(url: string, handoff: BrowserHandoff): BrowserHandoffOutcome {
  const host = getHostBridge();
  if (host === null) {
    window.location.href = url;
    return 'navigated';
  }
  void host.openExternal(url);
  publish(handoff);
  return 'handed-off';
}

export function finishBrowserHandoff(): void {
  if (current !== null) publish(null);
}

export function useBrowserHandoff(): BrowserHandoff | null {
  return useSyncExternalStore(subscribe, read, readOnServer);
}
