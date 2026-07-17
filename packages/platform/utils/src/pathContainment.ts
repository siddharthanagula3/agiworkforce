/**
 * pathContainment.ts — Pure path-containment helpers.
 *
 * The single source of truth for "is candidate inside root" used across
 * the extension and desktop surfaces. Uses Node's `path` module only —
 * no vscode dependency — so it can live in shared utils.
 *
 * Replaces five inline implementations in apps/extension-vscode that had
 * subtle correctness differences (some used `+ path.sep`, some didn't;
 * some checked `..` substring, some didn't).
 */

import * as path from 'node:path';

export type ContainmentResult =
  | { ok: true; resolved: string }
  | { ok: false; reason: 'traversal' | 'absolute-input' | 'not-in-root' | 'empty-input' };

/**
 * Resolve `candidate` against `root` and confirm it stays strictly inside.
 *
 * Rejects:
 *   - empty inputs
 *   - inputs that resolve to a path outside `root`
 *   - inputs with `..` segments that escape
 *   - absolute inputs (when `allowAbsolute=false`, the default)
 *
 * Returns the normalized absolute path on success. The check is
 * separator-aware: `/home/u/myproject` does NOT contain
 * `/home/u/myproject-evil` (the trailing separator check prevents
 * adjacent-directory bypass — F-05 in the audit).
 *
 * NOTE: This does NOT follow symlinks. Callers that need symlink-escape
 * detection must additionally call `fs.realpath` and re-check.
 */
export function resolveContained(
  root: string,
  candidate: string,
  opts?: { allowAbsolute?: boolean },
): ContainmentResult {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return { ok: false, reason: 'empty-input' };
  }
  if (!opts?.allowAbsolute && path.isAbsolute(candidate)) {
    return { ok: false, reason: 'absolute-input' };
  }
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absoluteRoot, candidate);

  // Use path.relative for the canonical "is contained" check.
  // path.relative('/a/b', '/a/b-evil/c') -> '../b-evil/c' (starts with '..')
  // path.relative('/a/b', '/a/b/c')      -> 'c'           (no '..' prefix)
  // path.relative('/a/b', '/a/b')        -> ''            (empty = equal)
  const rel = path.relative(absoluteRoot, resolved);
  if (rel === '') {
    return { ok: true, resolved };
  }
  // Reject if any path segment is '..' (i.e. relative escape).
  // Also reject if rel is absolute (Windows: different drive letters).
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    if (rel.startsWith('..')) {
      return { ok: false, reason: 'traversal' };
    }
    return { ok: false, reason: 'not-in-root' };
  }
  return { ok: true, resolved };
}

/**
 * Quick boolean check: is `candidate` (absolute path) contained in `root`?
 *
 * Use when you already have an absolute path (e.g. from `vscode.Uri.fsPath`)
 * and just want to know whether it's inside a workspace folder.
 */
export function isContainedIn(root: string, candidate: string): boolean {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  const result = resolveContained(root, candidate, { allowAbsolute: true });
  return result.ok;
}
