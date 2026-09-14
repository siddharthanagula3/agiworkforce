'use client';

import {
  DesktopRuntimeError,
  assertLocalTurnCarriesNoAttachments,
  getHostBridge,
  type ApplicationOpenResult,
  type BrowserPairingState,
  type ClipboardSnapshot,
  type FileEntry,
  type FileBinaryContent,
  type LocalChatMessage,
  type LocalChatResult,
  type LocalModel,
  type LocalModelSettings,
  type LocalModelSnapshot,
  type ShellPolicy,
  type ShellRunResult,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import type { BrowserPageSummary } from '@agiworkforce/types';

const NO_HOST_MESSAGE = 'Local access is only available in the AGI Cloud desktop app.';

export class DesktopHostUnavailable extends Error {
  constructor() {
    super(NO_HOST_MESSAGE);
    this.name = 'DesktopHostUnavailable';
  }
}

/**
 * Unwraps the runtime's result envelope. A refusal becomes a
 * `DesktopRuntimeError` carrying the capability the caller would need, so a
 * permission denial reads differently from a missing file at the call site.
 */
async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const host = getHostBridge();
  if (!host) throw new DesktopHostUnavailable();

  const response = await host.invokeRuntime<T>(command, args);
  if (!response.ok) throw new DesktopRuntimeError(response.error);
  return response.value;
}

export function listWorkspaceRoots(): Promise<WorkspaceRoot[]> {
  return invoke<WorkspaceRoot[]>('workspace_list_roots');
}

export function pickWorkspaceRoot(): Promise<WorkspaceRoot> {
  return invoke<WorkspaceRoot>('workspace_pick_root');
}

export function revokeWorkspaceRoot(rootId: string): Promise<boolean> {
  return invoke<boolean>('workspace_revoke_root', { rootId });
}

export function revealWorkspaceRoot(rootId: string): Promise<boolean> {
  return invoke<boolean>('workspace_reveal', { rootId });
}

export function listWorkspaceFiles(rootId: string, path: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('file_list', { rootId, path });
}

export function readWorkspaceFileBytes(rootId: string, path: string): Promise<FileBinaryContent> {
  return invoke<FileBinaryContent>('file_read_bytes', { rootId, path });
}

function decodeBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

/**
 * Reads a granted-folder file into the same `File` the `<input type="file">`
 * path produces, so it meets the composer's existing size and type rules
 * rather than a second set written for desktop.
 */
export async function readWorkspaceFile(
  rootId: string,
  entry: FileEntry,
  mimeType: string,
): Promise<File> {
  const content = await readWorkspaceFileBytes(rootId, entry.path);
  const bytes = decodeBase64(content.base64);
  return new File([bytes], entry.name, {
    type: mimeType,
    lastModified: content.modifiedAtMs,
  });
}

export function readLocalCommandPolicy(): Promise<ShellPolicy> {
  return invoke<ShellPolicy>('shell_policy_read');
}

export function writeLocalCommandPolicy(policy: ShellPolicy): Promise<ShellPolicy> {
  return invoke<ShellPolicy>('shell_policy_write', { policy });
}

export function cancelLocalCommand(runId: string): Promise<boolean> {
  return invoke<boolean>('shell_cancel', { runId });
}

export interface LocalCommandRun {
  runId: string;
  result: Promise<ShellRunResult>;
}

export interface LocalCommandOutput {
  stream: 'stdout' | 'stderr';
  text: string;
}

/**
 * Starts a command and hands back its id before it finishes.
 *
 * The id is chosen here rather than returned with the result, because output
 * arrives while the command runs and a Stop button needs something to name.
 */
export function startLocalCommand(
  input: { rootId: string; command: string; path?: string; timeoutMs?: number },
  onOutput: (output: LocalCommandOutput) => void,
): LocalCommandRun {
  const host = getHostBridge();
  if (!host) throw new DesktopHostUnavailable();

  const runId = crypto.randomUUID();
  const unsubscribe = host.onRuntimeEvent((event) => {
    if (event.kind === 'shell-output' && event.runId === runId) {
      onOutput({ stream: event.stream, text: event.chunk });
    }
  });

  const result = (async () => {
    try {
      return await invoke<ShellRunResult>('shell_run', {
        runId,
        rootId: input.rootId,
        command: input.command,
        ...(input.path ? { path: input.path } : {}),
        ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
      });
    } finally {
      unsubscribe();
    }
  })();

  return { runId, result };
}

export function openWorkspacePath(rootId: string, path: string): Promise<ApplicationOpenResult> {
  return invoke<ApplicationOpenResult>('app_open_path', { rootId, path });
}

export function revealWorkspacePath(rootId: string, path: string): Promise<ApplicationOpenResult> {
  return invoke<ApplicationOpenResult>('app_reveal_path', { rootId, path });
}

export function readHostClipboard(): Promise<ClipboardSnapshot> {
  return invoke<ClipboardSnapshot>('clipboard_read');
}

/**
 * The clipboard as composer attachments.
 *
 * Text becomes a `.txt` file rather than composer text: the composer already
 * turns a long paste into an attachment, and a clipboard holding a whole file
 * should not silently replace what the user has typed.
 */
export function clipboardAttachments(snapshot: ClipboardSnapshot, nowMs: number): File[] {
  const files: File[] = [];
  if (snapshot.image) {
    files.push(
      new File([decodeBase64(snapshot.image.base64)], `clipboard-${nowMs}.png`, {
        type: 'image/png',
        lastModified: nowMs,
      }),
    );
  }
  if (snapshot.text) {
    files.push(
      new File([snapshot.text], `clipboard-${nowMs}.txt`, {
        type: 'text/plain',
        lastModified: nowMs,
      }),
    );
  }
  return files;
}

export function readBrowserPairing(): Promise<BrowserPairingState> {
  return invoke<BrowserPairingState>('browser_pairing_state');
}

export function installBrowserHost(): Promise<string[]> {
  return invoke<string[]>('browser_pairing_install_host');
}

export function unpairBrowser(): Promise<BrowserPairingState> {
  return invoke<BrowserPairingState>('browser_pairing_unpair');
}

export function readPairedPage(): Promise<BrowserPageSummary> {
  return invoke<BrowserPageSummary>('browser_read_page');
}

export function clickInPairedBrowser(selector: string): Promise<{ clicked: boolean }> {
  return invoke<{ clicked: boolean }>('browser_click', { selector });
}

export function typeInPairedBrowser(
  selector: string,
  text: string,
  clear = false,
): Promise<{ typed: boolean }> {
  return invoke<{ typed: boolean }>('browser_type', { selector, text, clear });
}

export function navigatePairedBrowser(url: string): Promise<{ url: string }> {
  return invoke<{ url: string }>('browser_navigate', { url });
}

export function capturePairedBrowser(): Promise<{ dataUrl: string }> {
  return invoke<{ dataUrl: string }>('browser_screenshot');
}

export function readPairedBrowserConsole(options: {
  pattern?: string;
  level?: string;
  limit?: number;
}): Promise<{ origin: string; console: unknown[] }> {
  return invoke<{ origin: string; console: unknown[] }>('browser_console', options);
}

export function readPairedBrowserNetwork(options: {
  pattern?: string;
  resourceType?: string;
  failedOnly?: boolean;
  limit?: number;
}): Promise<{ origin: string; network: unknown[] }> {
  return invoke<{ origin: string; network: unknown[] }>('browser_network', options);
}

export function downloadThroughPairedBrowser(
  url: string,
): Promise<{ download: { filename?: string; url?: string } | null }> {
  return invoke<{ download: { filename?: string; url?: string } | null }>('browser_download', {
    url,
  });
}

/**
 * A browser screenshot as the composer's own attachment type, so it meets the
 * same size and kind rules a dragged-in image does.
 */
export function screenshotAttachment(dataUrl: string, nowMs: number): File {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return new File([decodeBase64(base64)], `browser-${nowMs}.png`, {
    type: 'image/png',
    lastModified: nowMs,
  });
}

export function readLocalModelSnapshot(): Promise<LocalModelSnapshot> {
  return invoke<LocalModelSnapshot>('local_model_servers');
}

export function listLocalModels(): Promise<LocalModel[]> {
  return invoke<LocalModel[]>('local_model_list');
}

export function readLocalModelSettings(): Promise<LocalModelSettings> {
  return invoke<LocalModelSettings>('local_model_settings_read');
}

export function writeLocalModelSettings(
  settings: Partial<LocalModelSettings>,
): Promise<LocalModelSettings> {
  return invoke<LocalModelSettings>('local_model_settings_write', { settings });
}

export function cancelLocalChat(runId: string): Promise<boolean> {
  return invoke<boolean>('local_chat_cancel', { runId });
}

export interface LocalChatDelta {
  channel: 'text' | 'thinking';
  delta: string;
}

export interface LocalChatRun {
  runId: string;
  result: Promise<LocalChatResult>;
}

/**
 * Runs one turn on a model installed on this machine.
 *
 * The run id is chosen here rather than returned with the result because the
 * answer arrives delta by delta while the turn is still open, and Stop needs
 * something to name before there is anything to stop.
 */
export function startLocalChat(
  input: { modelId: string; messages: LocalChatMessage[]; timeoutMs?: number },
  onDelta: (delta: LocalChatDelta) => void,
): LocalChatRun {
  assertLocalTurnCarriesNoAttachments(input.messages);
  const host = getHostBridge();
  if (!host) throw new DesktopHostUnavailable();

  const runId = crypto.randomUUID();
  const unsubscribe = host.onRuntimeEvent((event) => {
    if (event.kind === 'local-chat-delta' && event.runId === runId) {
      onDelta({ channel: event.channel, delta: event.delta });
    }
  });

  const result = (async () => {
    try {
      return await invoke<LocalChatResult>('local_chat_start', {
        runId,
        modelId: input.modelId,
        messages: input.messages,
        ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
      });
    } finally {
      unsubscribe();
    }
  })();

  return { runId, result };
}
