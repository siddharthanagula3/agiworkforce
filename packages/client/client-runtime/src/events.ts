
import { isTauri } from './detect';

export type EventCallback<T> = (payload: T) => void;

export type UnlistenFn = () => void;

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

  if (!memoryBus) {
    return () => {};
  }

  const handler = (e: Event) => {
    callback((e as CustomEvent<T>).detail);
  };
  memoryBus.addEventListener(event, handler);
  return () => memoryBus.removeEventListener(event, handler);
}

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

export async function emit<T>(event: string, payload: T): Promise<void> {
  if (isTauri) {
    const { emit: tauriEmit } = await import('@tauri-apps/api/event');
    await tauriEmit(event, payload);
    return;
  }

  if (!memoryBus) return;
  memoryBus.dispatchEvent(new CustomEvent(event, { detail: payload }));
}
