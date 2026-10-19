import * as path from 'node:path';
import * as vscode from 'vscode';

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

interface GitApi {
  toGitUri(uri: vscode.Uri, ref: string): vscode.Uri;
}

async function gitApi(): Promise<GitApi | undefined> {
  const extension = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>('vscode.git');
  if (extension === undefined) return undefined;
  const exports = extension.isActive ? extension.exports : await extension.activate();
  return exports.getAPI(1);
}

/**
 * Opens one multi-file diff of what a reply changed, each file against its last
 * commit, in VS Code's own diff editor where hunks can be kept or reverted.
 */
export async function openTurnChanges(files: readonly string[]): Promise<void> {
  const git = await gitApi().catch(() => undefined);
  if (git === undefined) {
    for (const file of files) {
      await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: false });
    }
    void vscode.window.showInformationMessage(
      'AGI Workforce: this workspace has no source control to diff against, so the changed files opened instead.',
    );
    return;
  }
  const resources = files.map((file) => {
    const uri = vscode.Uri.file(file);
    return [uri, git.toGitUri(uri, 'HEAD'), uri] as const;
  });
  const title =
    files.length === 1
      ? `Changes in ${path.basename(files[0] ?? '')}`
      : `Changes in ${files.length} files`;
  await vscode.commands.executeCommand('vscode.changes', title, resources);
}
