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
