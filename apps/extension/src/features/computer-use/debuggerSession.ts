const CDP_PROTOCOL_VERSION = '1.3';
const DETACH_REASON_USER_CANCELED = 'canceled_by_user';
const ALREADY_ATTACHED_MESSAGE = 'Another debugger is already attached';

export type DebuggerEventHandler = (
  tabId: number,
  method: string,
  params: Record<string, unknown>,
) => void;

export type DebuggerTabHandler = (tabId: number) => void;

const holds = new Map<number, number>();
const eventHandlers = new Set<DebuggerEventHandler>();
const reattachHandlers = new Set<DebuggerTabHandler>();
const userDetachHandlers = new Set<DebuggerTabHandler>();

let listenersInstalled = false;

function debuggee(tabId: number): chrome.debugger.Debuggee {
  return { tabId };
}

export function throwIfCdpCancelled(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException('Computer-use CDP operation was cancelled', 'AbortError');
}

function attachDebuggee(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(debuggee(tabId), CDP_PROTOCOL_VERSION, () => {
      const message = chrome.runtime.lastError?.message ?? '';
      if (message && !message.includes(ALREADY_ATTACHED_MESSAGE)) {
        reject(new Error(`CDP attach failed: ${message}`));
        return;
      }
      resolve();
    });
  });
}

function detachDebuggee(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    chrome.debugger.detach(debuggee(tabId), () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

export function debuggerHoldCount(tabId: number): number {
  return holds.get(tabId) ?? 0;
}

export function dropDebuggerHolds(tabId: number): void {
  holds.delete(tabId);
}

export function onDebuggerEvent(handler: DebuggerEventHandler): () => void {
  ensureDebuggerSessionListeners();
  eventHandlers.add(handler);
  return () => eventHandlers.delete(handler);
}

export function onDebuggerReattached(handler: DebuggerTabHandler): () => void {
  ensureDebuggerSessionListeners();
  reattachHandlers.add(handler);
  return () => reattachHandlers.delete(handler);
}

export function onDebuggerUserDetach(handler: DebuggerTabHandler): () => void {
  ensureDebuggerSessionListeners();
  userDetachHandlers.add(handler);
  return () => userDetachHandlers.delete(handler);
}

export function ensureDebuggerSessionListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;
  try {
    if (typeof chrome === 'undefined' || !chrome.debugger?.onDetach) return;
    chrome.debugger.onDetach.addListener((source, reason) => {
      const tabId = source.tabId;
      if (tabId === undefined) return;
      if (reason === DETACH_REASON_USER_CANCELED) {
        dropDebuggerHolds(tabId);
        for (const handler of userDetachHandlers) handler(tabId);
        return;
      }
      if (debuggerHoldCount(tabId) === 0) return;
      void attachDebuggee(tabId).then(
        () => {
          for (const handler of reattachHandlers) handler(tabId);
        },
        () => {
          dropDebuggerHolds(tabId);
        },
      );
    });
    chrome.debugger.onEvent?.addListener((source, method, params) => {
      const tabId = source.tabId;
      if (tabId === undefined) return;
      const payload = (params ?? {}) as Record<string, unknown>;
      for (const handler of eventHandlers) handler(tabId, method, payload);
    });
  } catch {
    // chrome.debugger is absent outside an extension worker.
  }
}

/**
 * Attaches the DevTools Protocol to `tabId` and counts the caller as a holder.
 *
 * The per-action driver and a long-lived console or network watch both need the
 * same single Chrome-enforced attachment. Without the count the driver's detach
 * at the end of one click silently tore down a running watch, and the watch's
 * detach ended a run mid-action. Every acquire must be paired with a release.
 */
export async function acquireDebugger(tabId: number, signal?: AbortSignal): Promise<void> {
  throwIfCdpCancelled(signal);
  ensureDebuggerSessionListeners();
  const next = debuggerHoldCount(tabId) + 1;
  holds.set(tabId, next);
  try {
    await attachDebuggee(tabId);
  } catch (error) {
    const remaining = debuggerHoldCount(tabId) - 1;
    if (remaining <= 0) holds.delete(tabId);
    else holds.set(tabId, remaining);
    throw error;
  }
}

export async function releaseDebugger(tabId: number): Promise<void> {
  const remaining = debuggerHoldCount(tabId) - 1;
  if (remaining > 0) {
    holds.set(tabId, remaining);
    return;
  }
  holds.delete(tabId);
  await detachDebuggee(tabId);
}

export async function sendDebuggerCommand<T = unknown>(
  tabId: number,
  method: string,
  params?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  throwIfCdpCancelled(signal);
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(debuggee(tabId), method, params ?? {}, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`CDP ${method} failed: ${chrome.runtime.lastError.message ?? 'unknown'}`));
      } else if (signal?.aborted) {
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : new DOMException('Computer-use CDP operation was cancelled', 'AbortError'),
        );
      } else {
        resolve(result as T);
      }
    });
  });
}

export async function withDebugger<T>(
  tabId: number,
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  await acquireDebugger(tabId, signal);
  try {
    throwIfCdpCancelled(signal);
    const result = await fn();
    throwIfCdpCancelled(signal);
    return result;
  } finally {
    await releaseDebugger(tabId);
  }
}
