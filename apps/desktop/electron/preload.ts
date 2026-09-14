/**
 * Sandboxed preload for the Electron cloud shell.
 *
 * Exposes exactly the `ElectronHostBridge` contract
 * (`src/lib/tauri-electron/bridgeContract.ts`) as `window.agiHost`, the only
 * surface the renderer has beyond the DOM. No Node globals leak into the page
 * (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`).
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
 * Exposed unconditionally; the main process decides who may actually call.
 *
 * An earlier version of this checked `location.origin` here and refused to
 * expose the object off-origin. It never exposed anything at all: a sandboxed
 * preload runs before the document exists, so there was no location to read.
 * `isTrustedSender` in `main.ts` is the real gate, and it is the better place
 * for one, because the main process cannot be lied to about the caller.
 */
contextBridge.exposeInMainWorld('agiHost', agiHost);

/**
 * A dropped folder never reaches the page: a directory has no bytes for the
 * DOM to hand over, so the main process is told its path and asks for a
 * workspace grant. Files fall through untouched to the page's own handler.
 */
window.addEventListener('drop', (event) => {
  const dropped = Array.from((event as DragEvent).dataTransfer?.files ?? []);
  if (dropped.length === 0) return;
  const paths = dropped.map((file) => webUtils.getPathForFile(file)).filter((path) => path !== '');
  if (paths.length === 0) return;
  void ipcRenderer.invoke(ELECTRON_IPC_CHANNELS.workspaceDrop, paths);
});

/**
 * Tell the main process which theme the page settled on.
 *
 * The shell's own dialogs and menus are drawn by macOS, which picks their
 * appearance from the process, not from the page's stylesheet. Until this
 * existed, a user on the light theme got a dark permission prompt, and the
 * Settings theme control could not reach it at all.
 *
 * The page's resolved theme is whatever `data-theme` says on the html element,
 * and nothing when the user is on "system", where macOS is already right.
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
