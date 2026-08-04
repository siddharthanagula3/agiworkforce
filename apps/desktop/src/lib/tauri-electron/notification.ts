/** Electron replacement for `@tauri-apps/plugin-notification`. */
import { getElectronHostBridge } from './bridgeContract';

export async function sendNotification(
  options: string | { title: string; body?: string },
): Promise<void> {
  const host = getElectronHostBridge();
  if (!host) return;
  const request = typeof options === 'string' ? { title: options } : options;
  await host.notify({
    title: request.title,
    ...(request.body !== undefined ? { body: request.body } : {}),
  });
}
