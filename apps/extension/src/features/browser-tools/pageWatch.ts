import {
  acquireDebugger,
  onDebuggerEvent,
  onDebuggerReattached,
  onDebuggerUserDetach,
  releaseDebugger,
  sendDebuggerCommand,
} from '../computer-use/debuggerSession';
import { clearConsoleEntries, CONSOLE_DOMAINS, recordConsoleEvent } from './consoleCapture';
import { clearNetworkEntries, NETWORK_DOMAINS, recordNetworkEvent } from './networkCapture';
import { authorizeBrowserToolTab } from './tabAuthority';

export type PageWatchOwner = 'run' | 'user';

export interface PageWatchState {
  readonly tabId: number;
  readonly origin: string;
  readonly owners: readonly PageWatchOwner[];
}

const watches = new Map<number, { origin: string; owners: Set<PageWatchOwner> }>();

const WATCH_DOMAINS: readonly string[] = [...CONSOLE_DOMAINS, ...NETWORK_DOMAINS];

let wired = false;

function wireOnce(): void {
  if (wired) return;
  wired = true;
  onDebuggerEvent((tabId, method, params) => {
    if (!watches.has(tabId)) return;
    if (method.startsWith('Network.')) recordNetworkEvent(tabId, method, params);
    else recordConsoleEvent(tabId, method, params);
  });
  onDebuggerReattached((tabId) => {
    if (!watches.has(tabId)) return;
    void enableDomains(tabId);
  });
  onDebuggerUserDetach((tabId) => {
    watches.delete(tabId);
  });
}

async function enableDomains(tabId: number): Promise<void> {
  for (const domain of WATCH_DOMAINS) {
    try {
      await sendDebuggerCommand(tabId, `${domain}.enable`);
    } catch {
      // A domain a target does not implement must not sink the whole watch.
    }
  }
}

export function getPageWatch(tabId: number): PageWatchState | null {
  const watch = watches.get(tabId);
  if (!watch) return null;
  return { tabId, origin: watch.origin, owners: [...watch.owners] };
}

export function isPageWatchActive(tabId: number): boolean {
  return watches.has(tabId);
}

/**
 * Opens or joins the console and network capture for a tab.
 *
 * The origin is re-authorized on every call, including the one that only adds a
 * second owner, so a tab that left an approved origin stops feeding the buffers
 * rather than continuing under the grant it had when the watch opened.
 */
export async function startPageWatch(
  tabId: number,
  owner: PageWatchOwner,
): Promise<PageWatchState> {
  wireOnce();
  const authorized = await authorizeBrowserToolTab(tabId);

  const existing = watches.get(tabId);
  if (existing) {
    if (existing.origin !== authorized.origin) {
      existing.origin = authorized.origin;
      clearConsoleEntries(tabId);
      clearNetworkEntries(tabId);
    }
    existing.owners.add(owner);
    return getPageWatch(tabId)!;
  }

  await acquireDebugger(tabId);
  watches.set(tabId, { origin: authorized.origin, owners: new Set([owner]) });
  clearConsoleEntries(tabId);
  clearNetworkEntries(tabId);
  try {
    await enableDomains(tabId);
  } catch (error) {
    watches.delete(tabId);
    await releaseDebugger(tabId);
    throw error;
  }
  return getPageWatch(tabId)!;
}

export async function stopPageWatch(tabId: number, owner: PageWatchOwner): Promise<void> {
  const watch = watches.get(tabId);
  if (!watch) return;
  watch.owners.delete(owner);
  if (watch.owners.size > 0) return;
  watches.delete(tabId);
  await releaseDebugger(tabId);
}

export async function stopAllPageWatches(tabId: number): Promise<void> {
  if (!watches.has(tabId)) return;
  watches.delete(tabId);
  await releaseDebugger(tabId);
}

export function forgetPageWatchTab(tabId: number): void {
  watches.delete(tabId);
  clearConsoleEntries(tabId);
  clearNetworkEntries(tabId);
}
