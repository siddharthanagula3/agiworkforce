
import * as vscode from 'vscode';
import { isContainedIn } from '@agiworkforce/utils';

export async function getActiveWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri !== undefined) {
    const containing = vscode.workspace.getWorkspaceFolder(activeUri);
    if (containing !== undefined) return containing;
  }

  if (folders.length === 1) return folders[0];

  const picked = await vscode.window.showQuickPick(
    folders.map((f) => ({
      label: f.name,
      description: f.uri.fsPath,
      folder: f,
    })),
    { placeHolder: 'Select a workspace folder for this operation' },
  );
  return picked?.folder;
}

export function getActiveWorkspaceFolderSync(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri !== undefined) {
    const containing = vscode.workspace.getWorkspaceFolder(activeUri);
    if (containing !== undefined) return containing;
  }

  if (folders.length === 1) return folders[0];
  return undefined;
}

export function getWorkspaceFolderForUri(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.getWorkspaceFolder(uri);
}

export function isPathInWorkspace(absolutePath: string): boolean {
  const folders = vscode.workspace.workspaceFolders ?? [];
  return folders.some((f) => isContainedIn(f.uri.fsPath, absolutePath));
}

export function getAllWorkspaceFolders(): readonly vscode.WorkspaceFolder[] {
  return vscode.workspace.workspaceFolders ?? [];
}

/**
 * Cross-platform shell quoting for a single argument.
 *
 * On Windows, `terminal.sendText` invokes the user's default shell which is
 * usually PowerShell (1.46+) or cmd.exe. POSIX single-quote escaping is wrong
 * on both. The safe lowest-common-denominator: wrap in double quotes and
 * escape embedded `"` as `""` (PowerShell + cmd both accept this for literals,
 * and we avoid backtick / `$` issues by stripping them).
 *
 * On macOS / Linux, use POSIX single-quote escaping.
 *
 * Exported for unit tests.
 */
export function shellQuoteForCurrentPlatform(value: string): string {
  if (process.platform === 'win32') {
    const safe = value.replace(/[`$]/g, '');
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function getWorkspaceDisplayName(): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) return '<no workspace>';

  const active = getActiveWorkspaceFolderSync();
  if (active !== undefined) return active.name;

  if (folders.length > 1) {
    return vscode.workspace.name ?? `<${folders.length} roots>`;
  }
  return folders[0]?.name ?? '<no workspace>';
}
