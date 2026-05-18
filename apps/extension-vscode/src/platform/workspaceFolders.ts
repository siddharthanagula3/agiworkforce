/**
 * workspaceFolders.ts — Multi-root workspace helpers
 *
 * The codebase had multiple sites assuming `workspaceFolders[0]` which silently
 * scoped operations to the first root in a multi-root workspace. These helpers
 * centralize the "which folder are we acting on" decision.
 */

import * as vscode from 'vscode';

/**
 * Returns the workspace folder containing the active editor's document.
 *
 * Resolution order:
 *   1. Active text editor's document → its containing workspace folder
 *   2. Single workspace folder (only one root open)
 *   3. Multi-root with no active editor → prompts the user via QuickPick
 *   4. No folders open → returns undefined
 *
 * Use this for "act on current workspace" operations (git status/diff/commit,
 * test runner, patch application targeting the user's intended scope).
 */
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

/**
 * Synchronous variant of `getActiveWorkspaceFolder` — no QuickPick fallback.
 * Returns undefined in multi-root + no-active-editor case.
 *
 * Use this for non-interactive code paths (file-name resolution, telemetry
 * context, display strings) where prompting the user would be intrusive.
 */
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

/**
 * Returns the workspace folder that contains the given URI, or undefined.
 * Convenience wrapper that handles the no-folders-open case.
 */
export function getWorkspaceFolderForUri(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.getWorkspaceFolder(uri);
}

/**
 * Returns true if the given absolute path lives inside ANY of the open
 * workspace folders. Use to validate paths before file-write operations
 * (prevents writes outside the user's workspace via path traversal).
 */
export function isPathInWorkspace(absolutePath: string): boolean {
  const folders = vscode.workspace.workspaceFolders ?? [];
  return folders.some((f) => {
    const root = f.uri.fsPath;
    // Use a separator-aware prefix check to avoid false positives where
    // /home/user/project would match /home/user/project-other.
    return (
      absolutePath === root ||
      absolutePath.startsWith(root + '/') ||
      absolutePath.startsWith(root + '\\')
    );
  });
}

/**
 * Returns all workspace folders. Use only when an operation genuinely needs
 * to fan out to every root (e.g., a future "AGI: Show status of all roots").
 */
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
    // Strip backticks (PowerShell escape char) and `$` (variable expansion).
    // The original message is preserved as-is in the git commit anyway because
    // the Git extension API path is preferred; this fallback is a last resort.
    const safe = value.replace(/[`$]/g, '');
    return `"${safe.replace(/"/g, '""')}"`;
  }
  // POSIX: wrap in single quotes, escape embedded ' as '\''
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Display name for the current workspace context.
 * Returns the active folder's name if resolvable, "<multi-root>" if multiple
 * folders open without an active editor, or "<no workspace>" if none.
 */
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
