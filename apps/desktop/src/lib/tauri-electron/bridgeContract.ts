import type { HostNotifyRequest, HostShell } from '@agiworkforce/local-runtime-contract';

export type {
  DesktopDeepLink,
  DesktopDeepLinkTarget,
  HostBridge,
  HostNotifyRequest,
  HostShell,
} from '@agiworkforce/local-runtime-contract';
export {
  DESKTOP_DEEP_LINK_SCHEME,
  DESKTOP_DEEP_LINK_TARGETS,
  desktopDeepLink,
  getHostBridge,
  parseDesktopDeepLink,
} from '@agiworkforce/local-runtime-contract';

export type ElectronNotifyRequest = HostNotifyRequest;

/**
 * What the preload answers `shell` with. A hosted page reads it to decide
 * whether this shell has a Local mode; AGI Cloud is Electron and has none.
 */
export const ELECTRON_HOST_SHELL: HostShell = 'electron';

export const ELECTRON_IPC_CHANNELS = {
  invokeRuntime: 'agi:desktop-runtime',
  openExternal: 'agi:open-external',
  notify: 'agi:notify',
  deepLink: 'agi:deep-link',
  voiceHotkey: 'agi:voice-hotkey',
  hostCommand: 'agi:host-command',
  hostPreferences: 'agi:host-preferences',
  checkUpdate: 'agi:check-update',
  workspaceDrop: 'agi:workspace-drop',
  rendererTheme: 'agi:renderer-theme',
  openUpdateInstaller: 'agi:open-update-installer',
  restartToUpdate: 'agi:restart-to-update',
} as const;
