import type { HostBridge, HostNotifyRequest } from '@agiworkforce/local-runtime-contract';
import type { DesktopCloudUpdateAvailability } from '../desktopCloudUpdate';

export type {
  DesktopDeepLink,
  DesktopDeepLinkTarget,
  HostBridge,
  HostNotifyRequest,
} from '@agiworkforce/local-runtime-contract';
export {
  DESKTOP_DEEP_LINK_SCHEME,
  DESKTOP_DEEP_LINK_TARGETS,
  desktopDeepLink,
  getHostBridge,
  parseDesktopDeepLink,
} from '@agiworkforce/local-runtime-contract';

export type ElectronNotifyRequest = HostNotifyRequest;

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
  invokeRuntime: 'agi:desktop-runtime',
  openExternal: 'agi:open-external',
  windowControl: 'agi:window-control',
  dialog: 'agi:dialog',
  notify: 'agi:notify',
  relaunch: 'agi:relaunch',
  deepLink: 'agi:deep-link',
  voiceHotkey: 'agi:voice-hotkey',
  checkUpdate: 'agi:check-update',
  workspaceDrop: 'agi:workspace-drop',
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

/**
 * The desktop-only half of the bridge. A page the shell merely hosts sees
 * `HostBridge`; only the renderer AGI Cloud ships drives the window, the
 * account bridge and the updater.
 */
export interface ElectronHostBridge extends HostBridge {
  handles(command: string): boolean;
  invokeBridge(command: string, args?: Record<string, unknown>): Promise<unknown>;
  windowControl(request: ElectronWindowControlRequest): Promise<boolean>;
  dialog(request: ElectronDialogRequest): Promise<string | boolean | null>;
  relaunch(): Promise<void>;
  checkForUpdate(): Promise<DesktopCloudUpdateAvailability>;
  openUpdateInstaller(): Promise<void>;
}

export function getElectronHostBridge(): ElectronHostBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.agiHost as ElectronHostBridge | undefined;
}
