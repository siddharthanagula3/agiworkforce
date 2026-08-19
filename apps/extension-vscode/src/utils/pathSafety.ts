/**
 * pathSafety.ts — VS Code-aware path resolution against open workspace folders.
 *
 * Wraps `@agiworkforce/utils`'s pure `resolveContained` helper with:
 *   - workspace-folder iteration (multi-root aware)
 *   - sensitive-file denylist enforcement (.env, .pem, .ssh/, credentials)
 *   - optional symlink-escape detection via fs.realpath
 *
 * This is the single function every agent / chat / patch code path should
 * call before reading or writing a workspace-relative path. It replaces
 * five inline traversal checks (audit findings F-05, F-06, F-13).
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import { isSensitiveFile } from '@agiworkforce/utils';
import { resolveContained, type ContainmentResult } from '@agiworkforce/utils/path-containment';

export type SafeResolveResult =
  | { ok: true; uri: vscode.Uri; folder: vscode.WorkspaceFolder; resolvedPath: string }
  | {
      ok: false;
      reason: 'no-workspace' | 'traversal' | 'not-in-workspace' | 'sensitive' | 'symlink-escape';
    };

export interface SafeResolveOptions {
  checkSensitive?: boolean;
  allowSymlinkEscape?: boolean;
  allowAbsolute?: boolean;
}

/**
 * Resolve `input` against the open workspace folders. Tries each folder
 * in turn; returns the first containment success. Optionally checks the
 * sensitive-file denylist and symlink-escape behavior.
 *
 * Returns either {ok: true, uri, folder, resolvedPath} or {ok: false, reason}.
 *
 * @example
 *   const r = await safeResolveWorkspacePath('src/index.ts');
 *   if (!r.ok) return showError(r.reason);
 *   const doc = await vscode.workspace.openTextDocument(r.uri);
 */
export async function safeResolveWorkspacePath(
  input: string,
  opts?: SafeResolveOptions,
): Promise<SafeResolveResult> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    return { ok: false, reason: 'no-workspace' };
  }

  const checkSensitive = opts?.checkSensitive ?? true;
  const allowSymlinkEscape = opts?.allowSymlinkEscape ?? false;
  const allowAbsolute = opts?.allowAbsolute ?? false;

  let lastResult: ContainmentResult | undefined;
  for (const folder of folders) {
    const result = resolveContained(folder.uri.fsPath, input, { allowAbsolute });
    if (result.ok) {
      if (checkSensitive && isSensitiveFile(result.resolved)) {
        return { ok: false, reason: 'sensitive' };
      }
      if (!allowSymlinkEscape) {
        try {
          const real = await fs.realpath(result.resolved);
          const realCheck = resolveContained(folder.uri.fsPath, real, { allowAbsolute: true });
          if (!realCheck.ok) {
            return { ok: false, reason: 'symlink-escape' };
          }
          if (checkSensitive && isSensitiveFile(real)) {
            return { ok: false, reason: 'sensitive' };
          }
        } catch {
          // File doesn't exist yet (creation case) — realpath fails. Don't
          // treat as symlink-escape; the path itself already passed
          // containment, and new-file creation is gated separately.
        }
      }
      return {
        ok: true,
        uri: vscode.Uri.file(result.resolved),
        folder,
        resolvedPath: result.resolved,
      };
    }
    lastResult = result;
  }

  if (lastResult && !lastResult.ok) {
    if (lastResult.reason === 'traversal') return { ok: false, reason: 'traversal' };
    if (lastResult.reason === 'absolute-input') return { ok: false, reason: 'not-in-workspace' };
  }
  return { ok: false, reason: 'not-in-workspace' };
}

export function describeRejection(
  reason: Exclude<SafeResolveResult, { ok: true }>['reason'],
): string {
  switch (reason) {
    case 'no-workspace':
      return 'No workspace folder is open.';
    case 'traversal':
      return 'Path traversal blocked: resolved outside the workspace.';
    case 'not-in-workspace':
      return 'Path is not inside any open workspace folder.';
    case 'sensitive':
      return 'Path matches the sensitive-file denylist (.env, .pem, .ssh/, credentials, etc.). Refused.';
    case 'symlink-escape':
      return 'Symlink target escapes the workspace. Refused.';
    default: {
      const exhaustive: never = reason;
      return `Unknown rejection: ${String(exhaustive)}`;
    }
  }
}

export { isSensitiveFile } from '@agiworkforce/utils';
