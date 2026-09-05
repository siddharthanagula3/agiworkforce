/**
 * Sandboxed preload for the Electron cloud shell.
 *
 * Exposes exactly the `ElectronHostBridge` contract
 * (`src/lib/tauri-electron/bridgeContract.ts`) as `window.agiHost`, the only
 * surface the renderer has beyond the DOM. No Node globals leak into the page
 * (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`).
 */
import { contextBridge, ipcRenderer } from 'electron';
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

contextBridge.exposeInMainWorld('agiHost', agiHost);
