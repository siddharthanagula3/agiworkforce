import { getElectronHostBridge } from './bridgeContract';

export function onGlobalVoiceHotkey(handler: () => void): () => void {
  const host = getElectronHostBridge();
  if (!host?.onVoiceHotkey) return () => {};
  return host.onVoiceHotkey(handler);
}
