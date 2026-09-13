'use client';

import {
  DesktopRuntimeError,
  getHostBridge,
  type FileEntry,
  type FileBinaryContent,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';

const NO_HOST_MESSAGE = 'Local folders are only available in the AGI Cloud desktop app.';

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
