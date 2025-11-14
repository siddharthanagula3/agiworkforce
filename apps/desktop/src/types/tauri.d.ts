/**
 * Tauri Global Type Definitions
 *
 * Provides type safety for the Tauri API that is injected into the window object.
 * This allows proper TypeScript support for Tauri commands and events without
 * needing @ts-expect-error comments.
 */

/**
 * Represents a Tauri command result that can be any value
 */
type TauriCommandResult = any;

/**
 * Represents the Tauri invoke function signature
 */
type TauriInvoke = (command: string, args?: Record<string, any>) => Promise<TauriCommandResult>;

/**
 * Represents a Tauri event listener callback
 */
type TauriEventListener = (payload: any) => void;

/**
 * Represents the Tauri event unlisten function
 */
type TauriUnlisten = () => void;

/**
 * Represents the Tauri event listen function
 */
type TauriEventListen = (event: string, handler: TauriEventListener) => Promise<TauriUnlisten>;

/**
 * Represents the Tauri event emit function
 */
type TauriEventEmit = (event: string, payload?: any) => Promise<void>;

/**
 * Tauri Event API interface
 */
interface TauriEventAPI {
  listen: TauriEventListen;
  emit: TauriEventEmit;
}

/**
 * Tauri API object
 */
interface TauriAPI {
  invoke: TauriInvoke;
  event: TauriEventAPI;
}

/**
 * Extend the window object with Tauri API
 * This is available when running in Tauri desktop context
 */
declare global {
  interface Window {
    __TAURI__?: TauriAPI;
  }
}

export {};
