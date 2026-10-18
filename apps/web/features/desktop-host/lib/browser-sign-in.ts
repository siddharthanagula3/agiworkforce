'use client';

import { useSyncExternalStore } from 'react';
import { getHostBridge, hostSupportsBrowserSignIn } from '@agiworkforce/local-runtime-contract';
import { toUserMessage } from '@/lib/user-error-message';
import {
  cancelBrowserSignIn as cancelNativeSignIn,
  readBrowserSignInState,
  startBrowserSignIn,
} from './runtime-client';

export type BrowserSignInState =
  | { kind: 'idle' }
  | { kind: 'opening' }
  | { kind: 'waiting'; expiresAtMs: number }
  | { kind: 'cancelling' }
  | { kind: 'failed'; message: string; pending?: boolean };

export const BROWSER_SIGN_IN_NEEDS_UPDATE =
  'Update AGI Cloud to use browser sign-in with cancellation. You can still sign in here.';

const OPEN_FAILED = 'The browser could not be opened. Try again, or sign in here.';
const CANCEL_FAILED =
  'Sign-in could not be cancelled. Try cancelling again before signing in here.';
const EXPIRED =
  'That sign-in link has expired or was already used. Continue in your browser again, or sign in here.';
const IDLE: BrowserSignInState = { kind: 'idle' };

let current: BrowserSignInState = IDLE;
let operation = 0;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let stopHearing: (() => void) | undefined;
const listeners = new Set<() => void>();

export function browserSignInIsPending(state: BrowserSignInState): boolean {
  return (
    state.kind === 'opening' ||
    state.kind === 'waiting' ||
    state.kind === 'cancelling' ||
    (state.kind === 'failed' && state.pending === true)
  );
}

function publish(next: BrowserSignInState): void {
  clearTimeout(expiryTimer);
  current = next;
  if (next.kind === 'waiting') {
    expiryTimer = setTimeout(
      () => {
        operation += 1;
        publish({ kind: 'failed', message: EXPIRED });
      },
      Math.max(0, next.expiresAtMs - Date.now()),
    );
  }
  for (const listener of listeners) listener();
}

async function restorePendingSignIn(): Promise<void> {
  if (current.kind === 'opening' || current.kind === 'cancelling') return;
  const reading = operation;
  try {
    const state = await readBrowserSignInState();
    if (reading !== operation) return;
    if (state.kind === 'waiting') publish(state);
    else if (browserSignInIsPending(current)) publish({ kind: 'failed', message: EXPIRED });
  } catch (cause) {
    if (reading !== operation) return;
    publish({
      kind: 'failed',
      message: toUserMessage(cause, OPEN_FAILED),
      pending: browserSignInIsPending(current),
    });
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const host = getHostBridge();
  if (!stopHearing && host && hostSupportsBrowserSignIn(host)) {
    const stopEvents = host.onRuntimeEvent((event) => {
      if (event.kind !== 'browser-sign-in-expired') return;
      operation += 1;
      publish({ kind: 'failed', message: EXPIRED });
    });
    const onFocus = () => void restorePendingSignIn();
    window.addEventListener('focus', onFocus);
    stopHearing = () => {
      stopEvents();
      window.removeEventListener('focus', onFocus);
    };
    void restorePendingSignIn();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size !== 0) return;
    stopHearing?.();
    stopHearing = undefined;
  };
}

export async function beginBrowserSignIn(): Promise<boolean> {
  if (!hostSupportsBrowserSignIn(getHostBridge())) return false;
  if (current.kind === 'opening' || current.kind === 'cancelling') return false;
  const starting = ++operation;
  publish({ kind: 'opening' });
  try {
    const result = await startBrowserSignIn();
    if (starting !== operation) return false;
    publish({ kind: 'waiting', expiresAtMs: result.expiresAtMs });
    return true;
  } catch (cause) {
    if (starting !== operation) return false;
    publish({ kind: 'failed', message: toUserMessage(cause, OPEN_FAILED) });
    return false;
  }
}

export async function cancelBrowserSignIn(): Promise<boolean> {
  if (!hostSupportsBrowserSignIn(getHostBridge())) return false;
  const cancelling = ++operation;
  publish({ kind: 'cancelling' });
  try {
    await cancelNativeSignIn();
    if (cancelling !== operation) return false;
    publish(IDLE);
    return true;
  } catch (cause) {
    if (cancelling !== operation) return false;
    publish({ kind: 'failed', message: toUserMessage(cause, CANCEL_FAILED), pending: true });
    return false;
  }
}

export function useBrowserSignInState(): BrowserSignInState {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => IDLE,
  );
}
