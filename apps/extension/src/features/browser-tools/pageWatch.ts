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
  readonly suspended: boolean;
}

const watches = new Map<
  number,
  { origin: string; owners: Set<PageWatchOwner>; suspended: boolean }
>();

const WATCH_DOMAINS: readonly string[] = [...CONSOLE_DOMAINS, ...NETWORK_DOMAINS];

let wired = false;

function wireOnce(): void {
  if (wired) return;
  wired = true;
  onDebuggerEvent((tabId, method, params) => {
    const watch = watches.get(tabId);
    if (!watch || watch.suspended) return;
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
  return { tabId, origin: watch.origin, owners: [...watch.owners], suspended: watch.suspended };
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
    existing.suspended = false;
    return getPageWatch(tabId)!;
  }

  await acquireDebugger(tabId);
  watches.set(tabId, { origin: authorized.origin, owners: new Set([owner]), suspended: false });
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

/**
 * Stops recording the moment Chrome reports the tab is leaving the page the
 * watch was authorized against, before the new page's first CDP event arrives.
 *
 * The grant is per origin, and a watch is attached per tab, so a tab that
 * navigates carries the attachment onto whatever it becomes. Without this the
 * buffers filled with the new page's console and network under the old page's
 * origin, and the panel rendered them beside a banner naming the origin the
 * user had approved.
 */
export function suspendPageWatchForNavigation(tabId: number): boolean {
  const watch = watches.get(tabId);
  if (!watch || watch.suspended) return false;
  watch.suspended = true;
  clearConsoleEntries(tabId);
  clearNetworkEntries(tabId);
  return true;
}

/**
 * Re-authorizes a suspended watch against the tab's live origin. A tab that
 * landed somewhere unapproved loses the watch and the attachment rather than
 * waiting for the user to notice the refusal in the panel.
 */
export async function resumePageWatchAfterNavigation(tabId: number): Promise<void> {
  if (watches.get(tabId)?.suspended !== true) return;
  let origin: string;
  try {
    origin = (await authorizeBrowserToolTab(tabId)).origin;
  } catch {
    await stopAllPageWatches(tabId);
    clearConsoleEntries(tabId);
    clearNetworkEntries(tabId);
    return;
  }
  const watch = watches.get(tabId);
  if (!watch?.suspended) return;
  watch.origin = origin;
  watch.suspended = false;
  clearConsoleEntries(tabId);
  clearNetworkEntries(tabId);
}

export function forgetPageWatchTab(tabId: number): void {
  watches.delete(tabId);
  clearConsoleEntries(tabId);
  clearNetworkEntries(tabId);
}
