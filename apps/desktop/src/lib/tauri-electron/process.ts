/** Electron replacement for `@tauri-apps/plugin-process`. */
import { getElectronHostBridge } from './bridgeContract';

export async function relaunch(): Promise<void> {
  await getElectronHostBridge()?.relaunch();
}
