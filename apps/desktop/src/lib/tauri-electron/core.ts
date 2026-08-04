/**
 * Electron replacement for `@tauri-apps/api/core`.
 *
 * Cloud sign-in commands route to the Electron main process over the preload
 * bridge (the same role `account_clerk_native_request` and the keyring
 * commands play in Rust). Everything else falls through to `tauri-mock.ts`,
 * which routes cloud chat CRUD to the real HTTP API and mocks desktop-only
 * commands — identical to the cloud-web build.
 */
import { invoke as cloudWebInvoke } from '../tauri-mock';
import { getElectronHostBridge, isElectronBridgeCommand } from './bridgeContract';

export { isTauri } from '../tauri-mock';

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const host = getElectronHostBridge();
  if (host && isElectronBridgeCommand(command) && host.handles(command)) {
    return (await host.invokeBridge(command, args)) as T;
  }
  return cloudWebInvoke<T>(command, args);
}

export async function addPluginListener(): Promise<() => void> {
  return () => {};
}
