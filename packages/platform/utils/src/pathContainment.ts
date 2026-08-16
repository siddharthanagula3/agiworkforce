
import * as path from 'node:path';

export type ContainmentResult =
  | { ok: true; resolved: string }
  | { ok: false; reason: 'traversal' | 'absolute-input' | 'not-in-root' | 'empty-input' };

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

  const rel = path.relative(absoluteRoot, resolved);
  if (rel === '') {
    return { ok: true, resolved };
  }
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    if (rel.startsWith('..')) {
      return { ok: false, reason: 'traversal' };
    }
    return { ok: false, reason: 'not-in-root' };
  }
  return { ok: true, resolved };
}

export function isContainedIn(root: string, candidate: string): boolean {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  const result = resolveContained(root, candidate, { allowAbsolute: true });
  return result.ok;
}
