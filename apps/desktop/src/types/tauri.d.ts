/**
 * Tauri API type declarations for window.__TAURI__
 */

type TauriInvoke = <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;

interface TauriEventPayload<T = unknown> {
  payload: T;
}

type TauriEventListener<T = unknown> = (event: TauriEventPayload<T>) => void;

type TauriUnlisten = () => void;

type TauriEventListen = <T = unknown>(
  event: string,
  handler: TauriEventListener<T>,
) => Promise<TauriUnlisten>;

type TauriEventEmit = (event: string, payload?: unknown) => Promise<void>;

interface TauriEventAPI {
  listen: TauriEventListen;
  emit: TauriEventEmit;
}

interface TauriAPI {
  invoke: TauriInvoke;
  event: TauriEventAPI;
}

declare global {
  interface Window {
    __TAURI__?: TauriAPI;
  }
}

export {};
