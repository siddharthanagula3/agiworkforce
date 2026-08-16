import { getElectronHostBridge } from './bridgeContract';

export async function relaunch(): Promise<void> {
  await getElectronHostBridge()?.relaunch();
}
