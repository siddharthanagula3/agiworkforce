import type { DesktopCloudUpdateAvailability } from '../desktopCloudUpdate';

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

export const ELECTRON_IPC_CHANNELS = {
  invokeBridge: 'agi:invoke-bridge',
  openExternal: 'agi:open-external',
  windowControl: 'agi:window-control',
  dialog: 'agi:dialog',
  notify: 'agi:notify',
  relaunch: 'agi:relaunch',
  deepLink: 'agi:deep-link',
  voiceHotkey: 'agi:voice-hotkey',
  checkUpdate: 'agi:check-update',
  openUpdateInstaller: 'agi:open-update-installer',
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

export interface ElectronHostBridge {
  readonly platform: string;
  readonly appVersion: string;
  handles(command: string): boolean;
  invokeBridge(command: string, args?: Record<string, unknown>): Promise<unknown>;
  onDeepLink(callback: (url: string) => void): () => void;
  onVoiceHotkey(callback: () => void): () => void;
  openExternal(url: string): Promise<void>;
  windowControl(request: ElectronWindowControlRequest): Promise<boolean>;
  dialog(request: ElectronDialogRequest): Promise<string | boolean | null>;
  notify(request: ElectronNotifyRequest): Promise<void>;
  relaunch(): Promise<void>;
  checkForUpdate(): Promise<DesktopCloudUpdateAvailability>;
  openUpdateInstaller(): Promise<void>;
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
