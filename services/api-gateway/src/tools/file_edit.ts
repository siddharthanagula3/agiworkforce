
import { homedir } from 'node:os';
import { resolve as resolvePath } from 'node:path';

import { applyPatch, type ApplyPatchResult, WorkspaceEscapeError } from '@agiworkforce/apply-patch';

import { logger } from '../lib/logger';

export interface FileEditInput {
  patch: string;
  workspaceRoot?: string;
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
