/**
 * Sandboxed preload exposing exactly the `ElectronHostBridge` contract
 * (`src/lib/tauri-electron/bridgeContract.ts`) as `window.agiHost`, the only
 * surface the renderer has beyond the DOM.
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import {
  DESKTOP_RUNTIME_EVENT_CHANNEL,
  isHostCommand,
  type DesktopRuntimeEvent,
  type DesktopRuntimeResponse,
  type HostCommand,
  type HostPreferences,
  type HostPreferencesState,
} from '@agiworkforce/local-runtime-contract';
import {
  ELECTRON_BRIDGE_COMMANDS,
  ELECTRON_IPC_CHANNELS,
  type ElectronDialogRequest,
  type ElectronHostBridge,
  type ElectronNotifyRequest,
  type ElectronWindowControlRequest,
} from '../src/lib/tauri-electron/bridgeContract';

function argValue(prefix: string): string {
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

const bridgeCommands = new Set<string>(ELECTRON_BRIDGE_COMMANDS);

const agiHost: ElectronHostBridge = {
  platform: `electron-${process.platform}`,
  appVersion: argValue('--agi-app-version='),

  handles(command: string): boolean {
    return bridgeCommands.has(command);
  },

  async invokeBridge(command: string, args?: Record<string, unknown>): Promise<unknown> {
    if (!bridgeCommands.has(command)) {
      throw new Error(`Unknown bridge command: ${command}`);
    }
    return ipcRenderer.invoke(ELECTRON_IPC_CHANNELS.invokeBridge, command, args);
  },

  async invokeRuntime<T>(command: string, args?: Record<string, unknown>) {
    return (await ipcRenderer.invoke(
      ELECTRON_IPC_CHANNELS.invokeRuntime,
      command,
      args,
    )) as DesktopRuntimeResponse<T>;
  },

  onDeepLink(callback: (url: string) => void): () => void {
    const listener = (_event: unknown, url: unknown) => {
      if (typeof url === 'string') callback(url);
    };
    ipcRenderer.on(ELECTRON_IPC_CHANNELS.deepLink, listener);
    return () => {
      ipcRenderer.removeListener(ELECTRON_IPC_CHANNELS.deepLink, listener);
    };
  },

  onVoiceHotkey(callback: () => void): () => void {
    const listener = () => callback();
    ipcRenderer.on(ELECTRON_IPC_CHANNELS.voiceHotkey, listener);
    return () => {
      ipcRenderer.removeListener(ELECTRON_IPC_CHANNELS.voiceHotkey, listener);
    };
  },

  onHostCommand(callback: (command: HostCommand) => void): () => void {
    const listener = (_event: unknown, command: unknown) => {
      if (isHostCommand(command)) callback(command);
    };
    ipcRenderer.on(ELECTRON_IPC_CHANNELS.hostCommand, listener);
    return () => {
      ipcRenderer.removeListener(ELECTRON_IPC_CHANNELS.hostCommand, listener);
    };
  },

  onRuntimeEvent(callback: (event: DesktopRuntimeEvent) => void): () => void {
    const listener = (_event: unknown, payload: unknown) => {
      if (payload && typeof payload === 'object' && 'kind' in payload) {
        callback(payload as DesktopRuntimeEvent);
      }
    };
    ipcRenderer.on(DESKTOP_RUNTIME_EVENT_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(DESKTOP_RUNTIME_EVENT_CHANNEL, listener);
    };
  },

  async readPreferences(): Promise<HostPreferencesState> {
    return (await ipcRenderer.invoke(
      ELECTRON_IPC_CHANNELS.hostPreferences,
      null,
    )) as HostPreferencesState;
  },

  async writePreferences(patch: Partial<HostPreferences>): Promise<HostPreferencesState> {
    return (await ipcRenderer.invoke(
      ELECTRON_IPC_CHANNELS.hostPreferences,
      patch,
    )) as HostPreferencesState;
  },

  async openExternal(url: string): Promise<void> {
    await ipcRenderer.invoke(ELECTRON_IPC_CHANNELS.openExternal, url);
  },

  async windowControl(request: ElectronWindowControlRequest): Promise<boolean> {
    return (await ipcRenderer.invoke(ELECTRON_IPC_CHANNELS.windowControl, request)) === true;
  },

  async dialog(request: ElectronDialogRequest): Promise<string | boolean | null> {
    return (await ipcRenderer.invoke(ELECTRON_IPC_CHANNELS.dialog, request)) as
      | string
      | boolean
      | null;
  },

  async notify(request: ElectronNotifyRequest): Promise<void> {
    await ipcRenderer.invoke(ELECTRON_IPC_CHANNELS.notify, request);
  },

  async relaunch(): Promise<void> {
    await ipcRenderer.invoke(ELECTRON_IPC_CHANNELS.relaunch);
  },

  async checkForUpdate() {
    return ipcRenderer.invoke(ELECTRON_IPC_CHANNELS.checkUpdate);
  },

  async openUpdateInstaller(): Promise<void> {
    await ipcRenderer.invoke(ELECTRON_IPC_CHANNELS.openUpdateInstaller);
  },
};

/**
 * Exposed unconditionally. A sandboxed preload runs before the document, so
 * there is no origin to read here; `isTrustedSender` in `main.ts` is the gate.
 */
contextBridge.exposeInMainWorld('agiHost', agiHost);

/**
 * A directory has no bytes for the DOM to hand over, so its path goes to the
 * main process for a workspace grant. Files fall through to the page.
 */
window.addEventListener('drop', (event) => {
  const dropped = Array.from((event as DragEvent).dataTransfer?.files ?? []);
  if (dropped.length === 0) return;
  const paths = dropped.map((file) => webUtils.getPathForFile(file)).filter((path) => path !== '');
  if (paths.length === 0) return;
  void ipcRenderer.invoke(ELECTRON_IPC_CHANNELS.workspaceDrop, paths);
});

/**
 * The shell's dialogs are drawn by macOS, which takes their appearance from
 * the process rather than the page's stylesheet. `data-theme` carries the
 * page's choice, and is absent on "system", where macOS is already right.
 */
function reportResolvedTheme(): void {
  const declared = document.documentElement.getAttribute('data-theme');
  const theme = declared === 'dark' || declared === 'light' ? declared : 'system';
  void ipcRenderer.invoke(ELECTRON_IPC_CHANNELS.rendererTheme, theme).catch(() => undefined);
}

function watchResolvedTheme(): void {
  reportResolvedTheme();
  new MutationObserver(reportResolvedTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', watchResolvedTheme, { once: true });
} else {
  watchResolvedTheme();
}
