/**
 * @agiworkforce/apply-patch
 *
 * Lift of OpenClaw's `apply_patch` tool format, parser + applicator.
 * with a minimal `FSBridge` abstraction so callers can target real disk,
 * Tauri-scoped filesystems, S3, or sandbox bridges without forking the
 * patch logic.
 *
 * The patch format is:
 *
 * ```
 * *** Begin Patch
 * *** Add File: path/to/new.txt
 * +line one
 * +line two
 * *** Update File: path/to/edit.ts
 * @@ optional context @@
 * -old line
 * +new line
 *  unchanged context line
 * *** Delete File: path/to/old.txt
 * *** End Patch
 * ```
 *
 * Update hunks support increasingly-relaxed line matching (exact → trimEnd
 * → trim → unicode-punctuation-normalized) so models that quote slightly
 * mangled context lines still match.
 *
 * Ported from OpenClaw `src/agents/apply-patch.ts` + `apply-patch-update.ts`
 * (MIT, Peter Steinberger). See THIRD_PARTY_LICENSES.md at repo root.
 *
 * @packageDocumentation
 */

import { statSync as fsStatSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

import { applyUpdateHunkToContents } from './apply-update';
import { nodeFSBridge } from './node-fs-bridge';
import { parsePatch } from './parse';
import type { ApplyPatchOptions, ApplyPatchResult, FSBridge, Hunk } from './types';

export class WorkspaceEscapeError extends Error {
  override readonly name = 'WorkspaceEscapeError';
  readonly code = 'workspace_escape' as const;
  constructor(
    readonly attemptedPath: string,
    readonly cwd: string,
  ) {
    super(
      `Patch path "${attemptedPath}" escapes the workspace root (${cwd}). ` +
        `apply-patch refuses to write outside the workspace when workspaceOnly is enabled.`,
    );
  }
}

let _isCaseInsensitiveFsCache: boolean | null = null;
function isCaseInsensitiveFs(): boolean {
  if (_isCaseInsensitiveFsCache !== null) return _isCaseInsensitiveFsCache;
  if (process.platform === 'win32') {
    _isCaseInsensitiveFsCache = true;
    return true;
  }
  try {
    const execPath = process.execPath;
    const lower = execPath.toLowerCase();
    const probe = lower === execPath ? execPath.toUpperCase() : lower;
    if (probe === execPath) {
      _isCaseInsensitiveFsCache = process.platform === 'darwin';
      return _isCaseInsensitiveFsCache;
    }
    fsStatSync(probe);
    _isCaseInsensitiveFsCache = true;
    return true;
  } catch {
    _isCaseInsensitiveFsCache = false;
    return false;
  }
}

function pathStartsWith(haystack: string, prefix: string): boolean {
  if (isCaseInsensitiveFs()) {
    return haystack.toLowerCase().startsWith(prefix.toLowerCase());
  }
  return haystack.startsWith(prefix);
}

function pathEquals(a: string, b: string): boolean {
  if (isCaseInsensitiveFs()) {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

async function assertInsideWorkspace(p: string, cwd: string): Promise<void> {
  const resolved = isAbsolute(p) ? resolve(p) : resolve(cwd, p);
  if (!pathEquals(resolved, cwd) && !pathStartsWith(resolved, cwd + sep)) {
    throw new WorkspaceEscapeError(p, cwd);
  }
  let canonCwd: string;
  try {
    canonCwd = await realpath(cwd);
  } catch {
    canonCwd = cwd;
  }
  const canonTarget = await realpathOfExistingAncestor(resolved);
  if (!pathEquals(canonTarget, canonCwd) && !pathStartsWith(canonTarget, canonCwd + sep)) {
    throw new WorkspaceEscapeError(p, canonCwd);
  }
}

async function realpathOfExistingAncestor(target: string): Promise<string> {
  let current = target;
  for (let depth = 0; depth < 4096; depth += 1) {
    try {
      const real = await realpath(current);
      const suffix = target.slice(current.length);
      return suffix.length > 0 ? real + suffix : real;
    } catch {
      const parent = dirname(current);
      if (parent === current) return target;
      current = parent;
    }
  }
  return target;
}

export type {
  ApplyPatchOptions,
  ApplyPatchResult,
  ApplyPatchSummary,
  AddFileHunk,
  DeleteFileHunk,
  UpdateFileHunk,
  UpdateFileChunk,
  Hunk,
  FSBridge,
} from './types';
export { parsePatch } from './parse';
export { applyUpdateHunkToContents } from './apply-update';
export { nodeFSBridge } from './node-fs-bridge';

export async function applyPatch(
  patchText: string,
  options: ApplyPatchOptions = {},
): Promise<ApplyPatchResult> {
  const fs = options.fs ?? nodeFSBridge({ ...(options.cwd ? { cwd: options.cwd } : {}) });
  const hunks = parsePatch(patchText);
  if (hunks.length === 0) {
    throw new Error('No files were modified.');
  }

  const workspaceOnly = options.workspaceOnly !== false;
  const cwd = resolve(options.cwd ?? process.cwd());
  if (workspaceOnly) {
    for (const hunk of hunks) {
      await assertInsideWorkspace(hunk.path, cwd);
      if (hunk.kind === 'update' && hunk.movePath !== undefined) {
        await assertInsideWorkspace(hunk.movePath, cwd);
      }
    }
  }

  const summary = { added: [] as string[], modified: [] as string[], deleted: [] as string[] };
  const changelog: string[] = [];

  for (const hunk of hunks) {
    options.signal?.throwIfAborted?.();
    await applyHunk(fs, hunk);
    switch (hunk.kind) {
      case 'add':
        summary.added.push(hunk.path);
        changelog.push(`A ${hunk.path}`);
        break;
      case 'delete':
        summary.deleted.push(hunk.path);
        changelog.push(`D ${hunk.path}`);
        break;
      case 'update':
        summary.modified.push(hunk.path);
        changelog.push(hunk.movePath ? `M ${hunk.path} -> ${hunk.movePath}` : `M ${hunk.path}`);
        break;
    }
  }

  return { summary, text: changelog.join('\n') };
}

async function applyHunk(fs: FSBridge, hunk: Hunk): Promise<void> {
  switch (hunk.kind) {
    case 'add': {
      if (await fs.exists(hunk.path)) {
        throw new Error(`Cannot add ${hunk.path}: file already exists.`);
      }
      await fs.writeFile(hunk.path, hunk.contents);
      return;
    }
    case 'delete': {
      await fs.remove(hunk.path);
      return;
    }
    case 'update': {
      const original = await fs.readFile(hunk.path);
      const updated = applyUpdateHunkToContents(hunk.path, original, hunk.chunks);
      const target = hunk.movePath ?? hunk.path;
      await fs.writeFile(target, updated);
      if (hunk.movePath && hunk.movePath !== hunk.path) {
        await fs.remove(hunk.path);
      }
      return;
    }
  }
}
