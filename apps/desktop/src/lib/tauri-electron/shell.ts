/**
 * Electron replacement for `@tauri-apps/plugin-shell`.
 *
 * `open()` must reach the OS browser via the main process: the web stub's
 * `window.open` fallback would spawn an embedded BrowserWindow, which Google,
 * Microsoft, and Apple reject during OAuth with `disallowed_useragent`.
 */
import { getElectronHostBridge } from './bridgeContract';

export async function open(url: string): Promise<void> {
  const host = getElectronHostBridge();
  if (host) {
    await host.openExternal(url);
    return;
  }
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export class Command {
  constructor(
    public readonly command: string,
    public readonly args: string[] = [],
  ) {}

  async execute(): Promise<{ code: number; stdout: string; stderr: string }> {
    // The cloud-only shell has no local execution plane. Failing loudly beats
    // the web stub's fake `{ code: 0 }` success, which callers would trust.
    throw new Error('Shell commands are not available in the AGI cloud desktop app.');
  }
}
