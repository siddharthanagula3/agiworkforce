/**
 * file_edit tool — apply OpenClaw-format patches via the shared
 * `@agiworkforce/apply-patch` package.
 *
 * The package handles:
 *   - patch parsing (Add / Delete / Update / Move; cascade-relaxed line match)
 *   - workspace-only enforcement (lexical + realpath canonicalization)
 *   - FSBridge abstraction so callers can swap in scoped/sandboxed FS
 *
 * Cross-platform path semantics: the package uses `node:path` which picks
 * the platform separator (`/` on POSIX, `\` on Windows) automatically.
 * Callers passing string paths from the model should use forward slashes;
 * the package normalizes them on resolution. We additionally pass the
 * workspace `cwd` so `workspaceOnly` enforcement anchors against the
 * tenant's allowed root, not `process.cwd()`.
 */

import { homedir } from 'node:os';
import { resolve as resolvePath } from 'node:path';

import { applyPatch, type ApplyPatchResult, WorkspaceEscapeError } from '@agiworkforce/apply-patch';

import { logger } from '../lib/logger';

export interface FileEditInput {
  /** OpenClaw-format patch text. Required. */
  patch: string;
  /**
   * Workspace root. The package's `assertInsideWorkspace` rejects any path
   * that escapes this directory after symlink resolution. Default is the
   * gateway process cwd; production callers should pass an explicit
   * tenant-scoped path.
   */
  workspaceRoot?: string;
  /** Optional cancellation. */
  signal?: AbortSignal;
}

export interface FileEditError {
  ok: false;
  code: 'workspace_escape' | 'parse_error' | 'apply_error' | 'invalid_input';
  message: string;
  details?: Record<string, unknown>;
}

export interface FileEditOk {
  ok: true;
  result: ApplyPatchResult;
}

export type FileEditResult = FileEditOk | FileEditError;

const PATH_BLOCKLIST: ReadonlyArray<string> = [homedir(), '/etc', '/var', '/root', '/usr'];

function isBlockedRoot(workspaceRoot: string): boolean {
  const resolved = resolvePath(workspaceRoot);
  for (const blocked of PATH_BLOCKLIST) {
    const blockedResolved = resolvePath(blocked);
    if (resolved === blockedResolved) return true;
  }
  return false;
}

/**
 * Apply a patch under a workspace root. The shared package enforces
 * workspace-only by default; we additionally reject configurations whose
 * cwd is a system-sensitive directory (defense in depth).
 */
export async function applyFileEdit(input: FileEditInput): Promise<FileEditResult> {
  if (!input || typeof input.patch !== 'string' || input.patch.length === 0) {
    return { ok: false, code: 'invalid_input', message: 'patch is required' };
  }

  const cwd = input.workspaceRoot ? resolvePath(input.workspaceRoot) : process.cwd();
  if (isBlockedRoot(cwd)) {
    return {
      ok: false,
      code: 'workspace_escape',
      message: `Workspace root "${cwd}" is in the system-sensitive blocklist`,
    };
  }

  try {
    const result = await applyPatch(input.patch, {
      cwd,
      ...(input.signal ? { signal: input.signal } : {}),
      workspaceOnly: true,
    });
    return { ok: true, result };
  } catch (err) {
    if (err instanceof WorkspaceEscapeError) {
      return {
        ok: false,
        code: 'workspace_escape',
        message: err.message,
        details: { attemptedPath: err.attemptedPath, cwd: err.cwd },
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/^Invalid patch/i.test(message) || /context not found/i.test(message)) {
      return { ok: false, code: 'parse_error', message };
    }
    logger.warn({ message }, 'file_edit.apply failed');
    return { ok: false, code: 'apply_error', message };
  }
}
