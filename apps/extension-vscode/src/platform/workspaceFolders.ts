import * as vscode from 'vscode';

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

export function getAllWorkspaceFolders(): readonly vscode.WorkspaceFolder[] {
  return vscode.workspace.workspaceFolders ?? [];
}

/**
 * On Windows `terminal.sendText` reaches PowerShell or cmd.exe, where POSIX
 * single-quote escaping is wrong; both accept a double-quoted literal with `""`
 * for an embedded quote, and backticks and `$` are stripped because PowerShell
 * would still expand them.
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
