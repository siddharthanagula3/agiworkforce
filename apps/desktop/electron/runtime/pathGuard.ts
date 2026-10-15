import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  foldedFileName,
  isCredentialPath,
  isPathInside,
  isProtectedWorkspacePath,
  relativeWithinRoot,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import { gitMetadataPaths } from './shellSandbox';

export type PathRefusalReason =
  'traversal' | 'outside-workspace' | 'denied-file' | 'shared-file' | 'io-error';

export class PathRefused extends Error {
  readonly reason: PathRefusalReason;
  constructor(reason: PathRefusalReason, message: string) {
    super(message);
    this.name = 'PathRefused';
    this.reason = reason;
  }
}

export interface ResolvedWorkspacePath {
  /** The path as the caller wrote it, relative to the workspace root. */
  requested: string;
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
 *
 * A link whose target does not exist fails `realpath` exactly as a missing
 * name does, and a write through it lands wherever the link points. So a
 * missing component that is itself a link is refused rather than walked past.
 */
async function isDanglingLink(candidate: string): Promise<boolean> {
  try {
    return (await lstat(candidate)).isSymbolicLink();
  } catch {
    return false;
  }
}

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
      if (await isDanglingLink(current)) {
        throw new PathRefused(
          'traversal',
          `${path.basename(current)} is a link to something that does not exist, so where this path leads cannot be checked.`,
        );
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
  return { requested: relativePath, absolute, relative, root };
}

/**
 * Files whose contents are credentials rather than source, by their names.
 * Approving a folder is not approval to hand over the keys stored in it, so
 * this app opens none of them, even inside a granted root.
 *
 * That is all it is: a refusal by name, of this app's own file commands. A
 * command run in the folder reads such a file like any other, since neither
 * this sandbox nor the CLI's denies reads inside the workspace, and a second
 * name for the same file, such as a hard link, is not a credential name.
 * The message says what is refused and no more.
 */
export function assertNotDeniedFile(absolute: string): void {
  if (isCredentialPath(absolute)) {
    throw new PathRefused(
      'denied-file',
      `${path.basename(absolute)} is a credential file by its name, so this app does not open it for the agent.`,
    );
  }
}

const SUBMODULE_MAP_FILE = '.gitmodules';

/**
 * The file at the top of a folder that maps each submodule to its folder and
 * its source. The sandbox denies a command that file, so a page's write does
 * not get it either: a host that reads it would be told about submodules
 * that are not there, at addresses of the writer's choosing.
 */
function isSubmoduleMap(relativePath: string): boolean {
  const segments = relativePath
    .split(/[\\/]+/u)
    .filter((segment) => segment !== '' && segment !== '.');
  return segments.length === 1 && foldedFileName(segments[0] ?? '') === SUBMODULE_MAP_FILE;
}

/**
 * Whether a write would change something that decides what runs on this
 * machine later: git's metadata, the project's configuration, or a hook
 * manager's files. The path is judged as written and again as resolved, so a
 * link named for a protected file and a protected file reached through a link
 * are both caught, and so are the git directories a linked worktree or a
 * submodule keeps under another name, and the submodule map. Mirrors `is_protected_project_path` in
 * the sandbox-policy crate.
 */
export async function isProtectedWrite(resolved: ResolvedWorkspacePath): Promise<boolean> {
  if (isProtectedWorkspacePath(resolved.requested) || isProtectedWorkspacePath(resolved.relative)) {
    return true;
  }
  if (isSubmoduleMap(resolved.requested) || isSubmoduleMap(resolved.relative)) return true;
  const metadata = await gitMetadataPaths(resolved.root.path);
  return metadata.some((entry) =>
    isPathInside(entry, resolved.absolute, { platform: platform(), caseSensitive: false }),
  );
}

/**
 * A file written to one of those paths is a program chosen for a later,
 * unsandboxed run, so a write grant on the folder does not reach them.
 */
export async function assertWritable(resolved: ResolvedWorkspacePath): Promise<void> {
  assertNotDeniedFile(resolved.absolute);
  if (await isProtectedWrite(resolved)) {
    throw new PathRefused(
      'denied-file',
      `${resolved.requested} is git metadata, project configuration or a hook manager's file, which this app does not change for the agent.`,
    );
  }
}
