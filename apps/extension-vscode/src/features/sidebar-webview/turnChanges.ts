import { PRODUCT_NAMES } from '@agiworkforce/types';
import { realpath } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { resolvePathReferenceUri } from '../path-links';

/** Tool names that write a whole file the agent names by path, shared with the webview. */
export const FILE_WRITE_TOOL_NAMES: readonly string[] = [
  'write_file',
  'write',
  'create_file',
  'edit_file',
  'edit',
  'apply_patch',
  'notebook_edit',
];

const PATH_KEYS = ['path', 'file_path', 'filename'] as const;

function toolKey(name: string): string {
  return name.toLowerCase().replace(/[- ]/gu, '_');
}

export function writtenFilePath(toolName: string, input: unknown): string | undefined {
  if (!FILE_WRITE_TOOL_NAMES.includes(toolKey(toolName))) return undefined;
  if (input === null || typeof input !== 'object') return undefined;
  for (const key of PATH_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return undefined;
}

export async function hasUnsavedNotebook(filePath: string): Promise<boolean> {
  const dirty = vscode.workspace.notebookDocuments.filter(
    (notebook) => notebook.isDirty && notebook.uri.scheme === 'file',
  );
  if (dirty.some((notebook) => notebook.uri.fsPath === filePath)) return true;
  if (dirty.length === 0) return false;
  const target = await realpath(filePath).catch(() => undefined);
  if (target === undefined) return false;
  for (const notebook of dirty) {
    const candidate = await realpath(notebook.uri.fsPath).catch(() => undefined);
    if (candidate === target && notebook.isDirty) return true;
  }
  return false;
}

interface GitApi {
  toGitUri(uri: vscode.Uri, ref: string): vscode.Uri;
  getRepository(uri: vscode.Uri): object | null;
}

async function gitApi(): Promise<GitApi | undefined> {
  const extension = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>('vscode.git');
  if (extension === undefined) return undefined;
  const exports = extension.isActive ? extension.exports : await extension.activate();
  return exports.getAPI(1);
}

export async function openTurnChanges(files: readonly string[]): Promise<void> {
  if (!vscode.workspace.isTrusted) return;
  const uris = (
    await Promise.all(files.map((file) => resolvePathReferenceUri({ path: file })))
  ).filter((uri): uri is vscode.Uri => uri !== undefined);
  const git = await gitApi().catch(() => undefined);
  if (!vscode.workspace.isTrusted) return;
  if (uris.length === 0) {
    void vscode.window.showInformationMessage(
      'The changed files are unavailable in this workspace.',
    );
    return;
  }
  if (git === undefined || uris.some((uri) => git.getRepository(uri) === null)) {
    for (const uri of uris) {
      await vscode.window.showTextDocument(uri, { preview: false });
    }
    void vscode.window.showInformationMessage(
      `${PRODUCT_NAMES.code}: a Git comparison is unavailable. The changed files are open in the editor.`,
    );
    return;
  }
  const resources = uris.map((uri) => [uri, git.toGitUri(uri, 'HEAD'), uri] as const);
  const title =
    uris.length === 1
      ? `${path.basename(uris[0]?.fsPath ?? '')} since last commit`
      : `${uris.length} files since last commit`;
  await vscode.commands.executeCommand('vscode.changes', title, resources);
}
