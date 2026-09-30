'use client';

import { useSyncExternalStore } from 'react';
import { getHostBridge } from '@agiworkforce/local-runtime-contract';
import { toUserMessage } from '@/lib/user-error-message';
import { startBrowserSignIn } from './runtime-client';

export type BrowserSignInState =
  { kind: 'idle' } | { kind: 'waiting' } | { kind: 'failed'; message: string };

const OPEN_FAILED = 'The browser could not be opened. Try again, or sign in here.';
const EXPIRED =
  'That sign-in link has expired or was already used. Continue in your browser again, or sign in here.';
const IDLE: BrowserSignInState = { kind: 'idle' };

let current: BrowserSignInState = IDLE;
const listeners = new Set<() => void>();
let hearingShell = false;

function publish(next: BrowserSignInState): void {
  current = next;
  for (const listener of listeners) listener();
}

function hearShell(): void {
  const host = getHostBridge();
  if (hearingShell || !host) return;
  hearingShell = true;
  host.onRuntimeEvent((event) => {
    if (event.kind === 'browser-sign-in-expired') publish({ kind: 'failed', message: EXPIRED });
  });
}

function subscribe(listener: () => void): () => void {
  hearShell();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readState(): BrowserSignInState {
  return current;
}

function readServerState(): BrowserSignInState {
  return IDLE;
}

export async function beginBrowserSignIn(): Promise<boolean> {
  publish({ kind: 'waiting' });
  try {
    await startBrowserSignIn();
    return true;
  } catch (cause) {
    publish({ kind: 'failed', message: toUserMessage(cause, OPEN_FAILED) });
    return false;
  }
}

export function useBrowserSignInState(): BrowserSignInState {
  return useSyncExternalStore(subscribe, readState, readServerState);
}
