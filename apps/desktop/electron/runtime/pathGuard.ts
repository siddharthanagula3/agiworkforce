import { realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  ALWAYS_DENIED_BASENAMES,
  isPathInside,
  relativeWithinRoot,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';

export type PathRefusalReason = 'traversal' | 'outside-workspace' | 'denied-file' | 'io-error';

export class PathRefused extends Error {
  readonly reason: PathRefusalReason;
  constructor(reason: PathRefusalReason, message: string) {
    super(message);
    this.name = 'PathRefused';
    this.reason = reason;
  }
}

export interface ResolvedWorkspacePath {
  /** Absolute path on disk, symlinks resolved as far as the path exists. */
  absolute: string;
  /** POSIX-separated path relative to the workspace root. */
  relative: string;
  root: WorkspaceRoot;
}

function platform(): 'posix' | 'win32' {
  return process.platform === 'win32' ? 'win32' : 'posix';
}

/**
 * Rejects a caller-supplied relative path before it ever reaches the disk.
 *
 * Absolute paths are refused rather than honoured: the root is the only thing
 * that positions a request, so an absolute path is always either a mistake or
 * an escape attempt.
 */
function assertRelativeIsSafe(relativePath: string): void {
  if (relativePath.includes('\0')) {
    throw new PathRefused('traversal', 'Path contains a NUL byte.');
  }
  if (path.isAbsolute(relativePath) || /^[a-zA-Z]:/.test(relativePath)) {
    throw new PathRefused('traversal', 'Path must be relative to the workspace root.');
  }
  const segments = relativePath.split(/[\\/]+/);
  if (segments.some((segment) => segment === '..')) {
    throw new PathRefused('traversal', 'Path may not step outside the workspace root.');
  }
}

/**
 * Resolves symlinks for the deepest part of the path that exists.
 *
 * A write target does not exist yet, so `realpath` on the full path fails. The
 * ancestor is what matters: if the parent directory resolves inside the root,
 * a new child of it is inside too. Resolving only the existing prefix is what
 * lets a create call be checked as strictly as a read.
 */
async function resolveExistingPrefix(absolute: string): Promise<string> {
  let current = absolute;
  const trailing: string[] = [];

  for (;;) {
    try {
      const resolved = await realpath(current);
      return trailing.length === 0 ? resolved : path.join(resolved, ...trailing.reverse());
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw new PathRefused('io-error', `Could not resolve ${absolute}.`);
      }
      const parent = path.dirname(current);
      if (parent === current) {
        throw new PathRefused('io-error', `Could not resolve ${absolute}.`);
      }
      trailing.push(path.basename(current));
      current = parent;
    }
  }
}

export async function resolveWithinRoot(
  root: WorkspaceRoot,
  relativePath: string,
): Promise<ResolvedWorkspacePath> {
  assertRelativeIsSafe(relativePath);

  let rootReal: string;
  try {
    rootReal = await realpath(root.path);
  } catch {
    throw new PathRefused('outside-workspace', `Workspace ${root.name} is no longer reachable.`);
  }

  const joined = path.resolve(rootReal, relativePath);
  const absolute = await resolveExistingPrefix(joined);

  if (!isPathInside(rootReal, absolute, { platform: platform() })) {
    throw new PathRefused(
      'outside-workspace',
      'That path resolves outside the approved workspace folder.',
    );
  }

  const relative = relativeWithinRoot(rootReal, absolute, { platform: platform() }) ?? '';
  return { absolute, relative, root };
}

/**
 * Files whose contents are credentials rather than source. Approving a folder
 * is not approval to hand over the keys stored in it, so these stay refused
 * even inside a granted root.
 */
export function assertNotDeniedFile(absolute: string): void {
  const base = path.basename(absolute).toLowerCase();
  if (ALWAYS_DENIED_BASENAMES.includes(base)) {
    throw new PathRefused(
      'denied-file',
      `${path.basename(absolute)} is never readable by the agent.`,
    );
  }
}
