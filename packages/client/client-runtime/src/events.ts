/**
 * Event bus abstraction for cross-runtime event handling.
 *
 * In desktop mode: delegates to Tauri's event system.
 * In web mode: uses a simple in-memory EventTarget.
 * In test mode: uses in-memory EventTarget (same as web).
 */

import { isTauri } from './detect';

/** Callback type for event listeners. */
export type EventCallback<T> = (payload: T) => void;

/** Unsubscribe function returned by listen(). */
export type UnlistenFn = () => void;

/** In-memory event bus for non-Tauri runtimes. */
const memoryBus = typeof window !== 'undefined' ? new EventTarget() : null;

/**
 * Subscribe to an event by name.
 *
 * @param event - The event name (e.g., 'agentic:loop-update')
 * @param callback - Handler called with the event payload
 * @returns A function to unsubscribe
 */
export async function listen<T>(event: string, callback: EventCallback<T>): Promise<UnlistenFn> {
  if (isTauri) {
    const { listen: tauriListen } = await import('@tauri-apps/api/event');
    const unlisten = await tauriListen<T>(event, (e) => callback(e.payload));
    return unlisten;
  }

  // Web / test: in-memory event bus
  if (!memoryBus) {
    return () => {};
  }

  const handler = (e: Event) => {
    callback((e as CustomEvent<T>).detail);
  };
  memoryBus.addEventListener(event, handler);
  return () => memoryBus.removeEventListener(event, handler);
}

/**
 * Subscribe to an event, automatically unsubscribing after the first occurrence.
 */
export async function once<T>(event: string, callback: EventCallback<T>): Promise<UnlistenFn> {
  if (isTauri) {
    const { once: tauriOnce } = await import('@tauri-apps/api/event');
    const unlisten = await tauriOnce<T>(event, (e) => callback(e.payload));
    return unlisten;
  }

  if (!memoryBus) {
    return () => {};
  }

  const handler = (e: Event) => {
    callback((e as CustomEvent<T>).detail);
    memoryBus.removeEventListener(event, handler);
  };
  memoryBus.addEventListener(event, handler);
  return () => memoryBus.removeEventListener(event, handler);
}

/**
 * Emit an event with a payload.
 *
 * In desktop mode: emits via Tauri's event system.
 * In web/test mode: dispatches on the in-memory EventTarget.
 */
export async function emit<T>(event: string, payload: T): Promise<void> {
  if (isTauri) {
    const { emit: tauriEmit } = await import('@tauri-apps/api/event');
    await tauriEmit(event, payload);
    return;
  }

  if (!memoryBus) return;
  memoryBus.dispatchEvent(new CustomEvent(event, { detail: payload }));
}
