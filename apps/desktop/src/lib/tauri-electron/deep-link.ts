/**
 * Electron replacement for `@tauri-apps/plugin-deep-link`.
 *
 * Unlike the web stub (which registers nothing, so SSO callbacks are lost),
 * this subscribes to `agiworkforce-cloud://` URLs forwarded by the Electron
 * main process from the OS `open-url` / second-instance events.
 */
import { getElectronHostBridge } from './bridgeContract';

export async function onOpenUrl(handler: (urls: string[]) => void): Promise<() => void> {
  const host = getElectronHostBridge();
  if (!host) return () => {};
  return host.onDeepLink((url) => handler([url]));
}
