/**
 * Electron replacement for `@tauri-apps/plugin-dialog`, backed by native
 * dialogs in the main process.
 *
 * The web stub answers `false` to every `ask`/`confirm` — acceptable in a
 * browser tab where these paths are unreachable, but a shipped desktop app
 * must never silently answer "no" to a real confirmation prompt.
 */
import { getElectronHostBridge } from './bridgeContract';

function getDefaultPath(input?: string | { defaultPath?: string | null } | null): string | null {
  if (typeof input === 'string') return input;
  return input?.defaultPath ?? null;
}

function messageText(
  message: string,
  options?: string | { title?: string },
): {
  message: string;
  title?: string;
} {
  const title = typeof options === 'string' ? options : options?.title;
  return title === undefined ? { message } : { message, title };
}

export async function open(options?: {
  title?: string;
  directory?: boolean;
  multiple?: boolean;
}): Promise<string | string[] | null> {
  const host = getElectronHostBridge();
  if (!host) return null;
  const result = await host.dialog({
    kind: 'open',
    ...(options?.title !== undefined ? { title: options.title } : {}),
    ...(options?.directory !== undefined ? { directory: options.directory } : {}),
    ...(options?.multiple !== undefined ? { multiple: options.multiple } : {}),
  });
  return typeof result === 'string' ? result : null;
}

export async function save(
  input?: string | { defaultPath?: string | null; title?: string },
): Promise<string | null> {
  const host = getElectronHostBridge();
  const defaultPath = getDefaultPath(input);
  if (!host) return defaultPath ?? 'download.txt';
  const result = await host.dialog({
    kind: 'save',
    ...(defaultPath !== null ? { defaultPath } : {}),
    ...(typeof input === 'object' && input?.title !== undefined ? { title: input.title } : {}),
  });
  return typeof result === 'string' ? result : null;
}

export async function message(text: string, options?: string | { title?: string }): Promise<void> {
  const host = getElectronHostBridge();
  if (!host) return;
  await host.dialog({ kind: 'message', ...messageText(text, options) });
}

export async function ask(text: string, options?: string | { title?: string }): Promise<boolean> {
  const host = getElectronHostBridge();
  if (!host) return false;
  return (await host.dialog({ kind: 'ask', ...messageText(text, options) })) === true;
}

export async function confirm(
  text: string,
  options?: string | { title?: string },
): Promise<boolean> {
  const host = getElectronHostBridge();
  if (!host) return false;
  return (await host.dialog({ kind: 'confirm', ...messageText(text, options) })) === true;
}
