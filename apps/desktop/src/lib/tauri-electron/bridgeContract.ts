/**
 * Contract between the Electron main process and the electron-target renderer
 * bundle (`VITE_BUILD_TARGET=electron`).
 *
 * This file is the single source of truth for the preload-exposed host bridge:
 * `electron/preload.ts` implements it, `electron/main.ts` registers the
 * matching IPC handlers, and the `src/lib/tauri-electron/*` shims consume it.
 * The renderer never sees Node or Electron APIs — only this `window.agiHost`
 * surface, exposed via `contextBridge` from a sandboxed preload.
 */

/**
 * Invoke-style commands the Electron main process implements natively.
 *
 * These mirror the Tauri commands the cloud sign-in path calls
 * (`src-tauri/src/sys/account/`): the Clerk Frontend API proxy, the device
 * authorization flow against our own API, and the OS-encrypted token store.
 * Everything else the renderer invokes falls through to `tauri-mock.ts`
 * exactly like the cloud-web build.
 */
export const ELECTRON_BRIDGE_COMMANDS = [
  'account_clerk_native_request',
  'account_start_device_authorization',
  'account_poll_device_authorization',
  'account_approve_device_authorization',
  'account_store_api_base_url',
  'account_store_access_token',
  'account_store_refresh_token',
  'account_restore_access_token',
  'account_restore_refresh_token',
  'account_clear_tokens',
] as const;

export type ElectronBridgeCommand = (typeof ELECTRON_BRIDGE_COMMANDS)[number];

export function isElectronBridgeCommand(command: string): command is ElectronBridgeCommand {
  return (ELECTRON_BRIDGE_COMMANDS as readonly string[]).includes(command);
}

/** IPC channel names. Renderer-facing only through the preload bridge. */
export const ELECTRON_IPC_CHANNELS = {
  invokeBridge: 'agi:invoke-bridge',
  openExternal: 'agi:open-external',
  windowControl: 'agi:window-control',
  dialog: 'agi:dialog',
  notify: 'agi:notify',
  relaunch: 'agi:relaunch',
  deepLink: 'agi:deep-link',
} as const;

export type ElectronWindowControlAction =
  | 'minimize'
  | 'maximize'
  | 'unmaximize'
  | 'toggleMaximize'
  | 'isMaximized'
  | 'close'
  | 'show'
  | 'hide'
  | 'setFocus'
  | 'setAlwaysOnTop'
  | 'setTitle'
  | 'startDragging';

export interface ElectronWindowControlRequest {
  action: ElectronWindowControlAction;
  /** `setTitle` carries a string, `setAlwaysOnTop` a boolean. */
  value?: string | boolean;
}

export type ElectronDialogRequest =
  | { kind: 'message'; message: string; title?: string }
  | { kind: 'ask'; message: string; title?: string }
  | { kind: 'confirm'; message: string; title?: string }
  | { kind: 'open'; title?: string; directory?: boolean; multiple?: boolean }
  | { kind: 'save'; title?: string; defaultPath?: string };

export interface ElectronNotifyRequest {
  title: string;
  body?: string;
}

/**
 * The surface `electron/preload.ts` exposes as `window.agiHost`.
 *
 * Feature-detect with `window.agiHost?.handles(command)` — the same renderer
 * bundle must degrade to plain cloud-web behavior when opened in a browser
 * tab (dev flows), where `agiHost` is undefined.
 */
export interface ElectronHostBridge {
  readonly platform: string;
  readonly appVersion: string;
  handles(command: string): boolean;
  invokeBridge(command: string, args?: Record<string, unknown>): Promise<unknown>;
  onDeepLink(callback: (url: string) => void): () => void;
  openExternal(url: string): Promise<void>;
  windowControl(request: ElectronWindowControlRequest): Promise<boolean>;
  dialog(request: ElectronDialogRequest): Promise<string | boolean | null>;
  notify(request: ElectronNotifyRequest): Promise<void>;
  relaunch(): Promise<void>;
}

declare global {
  interface Window {
    agiHost?: ElectronHostBridge;
  }
}

export function getElectronHostBridge(): ElectronHostBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.agiHost;
}
