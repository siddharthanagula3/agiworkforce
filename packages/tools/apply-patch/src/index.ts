/**
 * @agiworkforce/apply-patch
 *
 * Lift of OpenClaw's `apply_patch` tool format — parser + applicator —
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

/**
 * Error thrown when a patch attempts to write outside the workspace root.
 * Code: `'workspace_escape'`. This is the typed patch-policy error callers
 * should `instanceof`-check to distinguish patch-rejection from raw
 * filesystem errors (ENOENT, EACCES, etc.) bubbling up from the FS bridge.
 */
export class WorkspaceEscapeError extends Error {
  override readonly name = 'WorkspaceEscapeError';
  readonly code = 'workspace_escape' as const;
  constructor(
    /** The path the patch tried to access. */
    readonly attemptedPath: string,
    /** The resolved cwd we were anchoring against. */
    readonly cwd: string,
  ) {
    super(
      `Patch path "${attemptedPath}" escapes the workspace root (${cwd}). ` +
        `apply-patch refuses to write outside the workspace when workspaceOnly is enabled.`,
    );
  }
}

/**
 * Reject any path that resolves outside `cwd`. Throws `WorkspaceEscapeError`
 * on violation. Absolute paths are rejected unless they already start with
 * the workspace root.
 *
 * Both the lexical resolution AND the canonical (symlink-followed) resolution
 * must stay inside the workspace. The symlink check protects against
 * "trojan symlink" attacks where a directory inside the workspace points
 * outside (e.g. `workspace/foo -> /etc`); without it, a patch targeting
 * `foo/passwd` would lexically resolve cleanly but actually write to /etc.
 */
/**
 * FIX (audit 2026-05-20, §13): the lexical `startsWith` check used to be a
 * raw byte comparison. On case-insensitive filesystems (macOS HFS+, Windows
 * NTFS) `/CWD/foo` and `/cwd/foo` resolve to the same inode but the byte
 * comparison would treat them as different paths — so a patch with
 * `--- /CWD/../escape` could potentially slip past the lexical gate before
 * the realpath check caught it.
 *
 * Use case-aware comparison on case-insensitive platforms. The realpath
 * resolution below remains the primary defense; this is belt-and-braces.
 *
 * FIX (Codex P2, 2026-05-20): detect case-insensitivity from the actual
 * filesystem, not a platform-wide assumption. macOS APFS can be either
 * case-insensitive (default) or case-sensitive; the previous platform check
 * treated APFS-case-sensitive volumes as case-insensitive and could let
 * a different-case-out-of-workspace path slip past the lexical gate.
 * Probe at module init by stat'ing `process.execPath` with case flipped:
 * if the FS resolves it, the FS is case-insensitive.
 */
let _isCaseInsensitiveFsCache: boolean | null = null;
function isCaseInsensitiveFs(): boolean {
  if (_isCaseInsensitiveFsCache !== null) return _isCaseInsensitiveFsCache;
  // Windows: NTFS / FAT32 / exFAT — always case-insensitive at the API
  // layer (NTFS has a case-sensitivity flag but it's off by default and
  // requires explicit per-directory opt-in).
  if (process.platform === 'win32') {
    _isCaseInsensitiveFsCache = true;
    return true;
  }
  // macOS / Linux: probe the actual filesystem. process.execPath always
  // exists, is absolute, and has alphabetic characters in practice
  // (e.g. /usr/local/bin/node, /opt/homebrew/bin/node).
  try {
    const execPath = process.execPath;
    const lower = execPath.toLowerCase();
    const probe = lower === execPath ? execPath.toUpperCase() : lower;
    if (probe === execPath) {
      // No case difference in execPath — fall back to the platform default.
      _isCaseInsensitiveFsCache = process.platform === 'darwin';
      return _isCaseInsensitiveFsCache;
    }
    // statSync of the case-flipped path: succeeds on case-insensitive FS,
    // throws ENOENT on case-sensitive FS.
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
  // Reject path-level escape first (lexical check, no fs call).
  const resolved = isAbsolute(p) ? resolve(p) : resolve(cwd, p);
  if (!pathEquals(resolved, cwd) && !pathStartsWith(resolved, cwd + sep)) {
    throw new WorkspaceEscapeError(p, cwd);
  }
  // Then canonicalize via realpath to reject symlink escapes. We canonicalize
  // the longest-existing ancestor of the target — `realpath` throws ENOENT
  // for paths that don't exist yet, which is the common case when adding new
  // files. The cwd itself is canonicalized so we compare apples-to-apples.
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
  // Walk up until we find an existing ancestor we can resolve. Bounded by
  // path-segment count so a malformed path can't loop forever.
  for (let depth = 0; depth < 4096; depth += 1) {
    try {
      const real = await realpath(current);
      // Append any unresolved suffix lexically (the suffix can't reintroduce
      // a symlink — by construction it doesn't exist on disk yet).
      const suffix = target.slice(current.length);
      return suffix.length > 0 ? real + suffix : real;
    } catch {
      const parent = dirname(current);
      if (parent === current) return target; // hit fs root with nothing existing
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

/**
 * Parse and apply a patch to the filesystem accessed via `fs`. Returns a
 * summary of what changed. Throws on any error (missing context, file not
 * found for update/delete, etc.) — apply-patch is intentionally
 * all-or-nothing per hunk; partial-on-error is the caller's choice if they
 * want to roll back.
 */
export async function applyPatch(
  patchText: string,
  options: ApplyPatchOptions = {},
): Promise<ApplyPatchResult> {
  const fs = options.fs ?? nodeFSBridge({ ...(options.cwd ? { cwd: options.cwd } : {}) });
  const hunks = parsePatch(patchText);
  if (hunks.length === 0) {
    throw new Error('No files were modified.');
  }

  // workspaceOnly defaults to true. The check anchors every hunk path
  // (and movePath) at the resolved cwd and rejects anything that escapes.
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
