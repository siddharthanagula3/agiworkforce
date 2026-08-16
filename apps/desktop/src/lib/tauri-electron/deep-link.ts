import { getElectronHostBridge } from './bridgeContract';

export async function onOpenUrl(handler: (urls: string[]) => void): Promise<() => void> {
  const host = getElectronHostBridge();
  if (!host) return () => {};
  return host.onDeepLink((url) => handler([url]));
}
