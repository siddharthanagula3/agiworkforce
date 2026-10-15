const CDP_PROTOCOL_VERSION = '1.3';
const DETACH_REASON_USER_CANCELED = 'canceled_by_user';

export type DebuggerEventHandler = (
  tabId: number,
  method: string,
  params: Record<string, unknown>,
) => void;

export type DebuggerTabHandler = (tabId: number) => void;

interface DebuggerSession {
  identity: symbol;
  holds: number;
  attached: boolean;
  attaching: Promise<void> | null;
}

const sessions = new Map<number, DebuggerSession>();
const sessionOperations = new Map<number, Promise<void>>();
const eventHandlers = new Set<DebuggerEventHandler>();
const detachHandlers = new Set<DebuggerTabHandler>();
const userDetachHandlers = new Set<DebuggerTabHandler>();
const sessionEndedHandlers = new Set<(tabId: number, session: symbol) => void>();

let listenersInstalled = false;

function debuggee(tabId: number): chrome.debugger.Debuggee {
  return { tabId };
}

export function throwIfCdpCancelled(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException('Computer-use CDP operation was cancelled', 'AbortError');
}

export function awaitCdpOperation<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort);
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException('Computer-use CDP operation was cancelled', 'AbortError'),
      );
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    void (async () => {
      try {
        resolve(await operation);
      } catch (error) {
        reject(error);
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
    })();
  });
}

function attachDebuggee(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(debuggee(tabId), CDP_PROTOCOL_VERSION, () => {
      const message = chrome.runtime.lastError?.message ?? '';
      if (message) {
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
  return sessions.get(tabId)?.holds ?? 0;
}

export function dropDebuggerHolds(tabId: number): void {
  const session = sessions.get(tabId);
  if (session) {
    session.holds = 0;
    session.attached = false;
    sessions.delete(tabId);
    for (const handler of sessionEndedHandlers) handler(tabId, session.identity);
  }
}

export function debuggerSessionIdentity(tabId: number): symbol | null {
  const session = sessions.get(tabId);
  return session?.attached ? session.identity : null;
}

function enqueueSessionOperation(tabId: number, operation: () => Promise<void>): Promise<void> {
  const previous = sessionOperations.get(tabId);
  const pending = (async () => {
    if (previous) await previous.catch(() => undefined);
    await operation();
  })();
  sessionOperations.set(tabId, pending);
  void (async () => {
    try {
      await pending;
    } catch {
      return;
    } finally {
      if (sessionOperations.get(tabId) === pending) sessionOperations.delete(tabId);
    }
  })();
  return pending;
}

export function onDebuggerEvent(handler: DebuggerEventHandler): () => void {
  ensureDebuggerSessionListeners();
  eventHandlers.add(handler);
  return () => eventHandlers.delete(handler);
}

export function onDebuggerDetached(handler: DebuggerTabHandler): () => void {
  ensureDebuggerSessionListeners();
  detachHandlers.add(handler);
  return () => detachHandlers.delete(handler);
}

export function onDebuggerSessionEnded(
  handler: (tabId: number, session: symbol) => void,
): () => void {
  sessionEndedHandlers.add(handler);
  return () => sessionEndedHandlers.delete(handler);
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
      dropDebuggerHolds(tabId);
      for (const handler of detachHandlers) handler(tabId);
      if (reason === DETACH_REASON_USER_CANCELED)
        for (const handler of userDetachHandlers) handler(tabId);
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
export async function acquireDebugger(tabId: number, signal?: AbortSignal): Promise<symbol> {
  throwIfCdpCancelled(signal);
  ensureDebuggerSessionListeners();
  let session = sessions.get(tabId);
  if (!session) {
    session = { identity: Symbol('debugger-session'), holds: 0, attached: false, attaching: null };
    sessions.set(tabId, session);
  }
  const captured = session;
  captured.holds++;
  try {
    if (!captured.attached && !captured.attaching) {
      captured.attaching = enqueueSessionOperation(tabId, async () => {
        if (sessions.get(tabId) !== captured || captured.holds === 0)
          throw new Error('The original debugger acquisition was cancelled.');
        await attachDebuggee(tabId);
        if (sessions.get(tabId) !== captured || captured.holds === 0) {
          await detachDebuggee(tabId);
          throw new Error('The original debugger acquisition was cancelled.');
        }
        captured.attached = true;
      });
    }
    if (captured.attaching) await awaitCdpOperation(captured.attaching, signal);
    throwIfCdpCancelled(signal);
    if (sessions.get(tabId) !== captured || !captured.attached)
      throw new Error('The original debugger session is no longer attached.');
    return captured.identity;
  } catch (error) {
    const release = releaseDebugger(tabId, captured.identity);
    if (signal?.aborted) void release.catch(() => undefined);
    else await release;
    throw error;
  }
}

export async function releaseDebugger(tabId: number, identity?: symbol): Promise<void> {
  const session = sessions.get(tabId);
  if (!session || (identity && session.identity !== identity)) return;
  if (--session.holds > 0) return;
  sessions.delete(tabId);
  for (const handler of sessionEndedHandlers) handler(tabId, session.identity);
  await enqueueSessionOperation(tabId, async () => {
    if (!session.attached) return;
    session.attached = false;
    await detachDebuggee(tabId);
  });
}

export async function sendDebuggerCommand<T = unknown>(
  tabId: number,
  method: string,
  params?: Record<string, unknown>,
  signal?: AbortSignal,
  onSubmitted?: () => void,
  onLateResult?: () => void,
): Promise<T> {
  throwIfCdpCancelled(signal);
  const session = debuggerSessionIdentity(tabId);
  if (!session) throw new Error('The original debugger session is no longer attached.');
  return new Promise((resolve, reject) => {
    let refused = false;
    let settled = false;
    const finish = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      complete();
    };
    const onAbort = (): void => {
      finish(() =>
        reject(
          signal?.reason instanceof Error
            ? signal.reason
            : new DOMException('Computer-use CDP operation was cancelled', 'AbortError'),
        ),
      );
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    try {
      chrome.debugger.sendCommand(debuggee(tabId), method, params ?? {}, (result) => {
        const error = chrome.runtime.lastError;
        if (settled) {
          if (!error && signal?.aborted) onLateResult?.();
          return;
        }
        if (debuggerSessionIdentity(tabId) !== session) {
          finish(() =>
            reject(new Error('The original debugger session changed during the command.')),
          );
        } else if (error) {
          refused = true;
          finish(() => reject(new Error(`CDP ${method} failed: ${error.message ?? 'unknown'}`)));
        } else if (signal?.aborted) onAbort();
        else finish(() => resolve(result as T));
      });
      if (!refused) onSubmitted?.();
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

export type NeutralInputCommand =
  | { kind: 'dragCancel' }
  | { kind: 'touchCancel' }
  | { kind: 'keyRelease'; key: string; code: string; windowsVirtualKeyCode: number };

export async function sendNeutralizingDebuggerCommand(
  tabId: number,
  session: symbol,
  command: NeutralInputCommand,
  signal: AbortSignal,
): Promise<void> {
  throwIfCdpCancelled(signal);
  if (debuggerSessionIdentity(tabId) !== session)
    throw new Error('The original debugger session is no longer attached.');
  if (command.kind === 'dragCancel') {
    await sendDebuggerCommand(tabId, 'Input.cancelDragging', {}, signal);
  } else if (command.kind === 'touchCancel') {
    await sendDebuggerCommand(
      tabId,
      'Input.dispatchTouchEvent',
      { type: 'touchCancel', touchPoints: [] },
      signal,
    );
  } else if (command.kind === 'keyRelease') {
    if (
      !command.key ||
      !command.code ||
      command.key.length > 64 ||
      command.code.length > 64 ||
      !Number.isInteger(command.windowsVirtualKeyCode) ||
      command.windowsVirtualKeyCode < 0 ||
      command.windowsVirtualKeyCode > 255
    )
      throw new Error('Invalid key release metadata.');
    await sendDebuggerCommand(
      tabId,
      'Input.dispatchKeyEvent',
      {
        type: 'keyUp',
        key: command.key,
        code: command.code,
        windowsVirtualKeyCode: command.windowsVirtualKeyCode,
        modifiers: 0,
      },
      signal,
    );
  } else {
    throw new Error('Unsupported input neutralization command.');
  }
}

export async function withDebugger<T>(
  tabId: number,
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const session = await acquireDebugger(tabId, signal);
  try {
    throwIfCdpCancelled(signal);
    if (debuggerSessionIdentity(tabId) !== session)
      throw new Error('The original debugger session is no longer attached.');
    const result = await fn();
    throwIfCdpCancelled(signal);
    if (debuggerSessionIdentity(tabId) !== session)
      throw new Error('The original debugger session changed during the operation.');
    return result;
  } finally {
    await releaseDebugger(tabId, session);
  }
}
