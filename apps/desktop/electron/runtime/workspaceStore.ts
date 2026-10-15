import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  isGrantableRoot,
  isPathInside,
  parseWorktreeRootId,
  worktreeRootId,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import { revokeScope } from './permissionManager';
import { readRegularFile } from './regularFile';

const roots = new Map<string, WorkspaceRoot>();

/**
 * Worktree checkouts the CLI made for an approved folder, admitted for this
 * run of the app only. They are never persisted: each is re-admitted, and
 * re-checked, the next time the folder's CLI lists it.
 */
const worktrees = new Map<string, WorkspaceRoot>();

const WORKTREE_MARKER = 'worktree.json';
const WORKTREE_CHECKOUT = 'checkout';
const GITDIR_PREFIX = 'gitdir:';
const MARKER_READ_LIMIT = 64 * 1024;
const GIT_FILE_READ_LIMIT = 4 * 1024;
let loaded = false;

function storePath(): string {
  return path.join(app.getPath('userData'), 'desktop-workspaces.json');
}

function currentPlatform(): 'posix' | 'win32' {
  return process.platform === 'win32' ? 'win32' : 'posix';
}

function isRootShape(value: unknown): value is WorkspaceRoot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkspaceRoot>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.path === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.grantedAtMs === 'number' &&
    typeof candidate.lastOpenedAtMs === 'number'
  );
}

/** The home folder as named and as it resolves, which a link or a volume can make differ. */
function homeSpellings(): string[] {
  const home = os.homedir();
  try {
    return [home, realpathSync(home)];
  } catch {
    return [home];
  }
}

function load(): void {
  if (loaded) return;
  loaded = true;
  let raw: string;
  try {
    raw = readFileSync(storePath(), 'utf8');
  } catch {
    return;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    // A folder approved before a rule existed is held to the rule now: a
    // stored grant on the home folder or on where keys are kept is not kept.
    const homes = homeSpellings();
    for (const entry of parsed) {
      if (isRootShape(entry) && isGrantableRoot(entry.path, currentPlatform(), homes)) {
        roots.set(entry.id, entry);
      }
    }
  } catch {
    // A corrupt store grants nothing.
  }
}

function persist(): void {
  try {
    writeFileSync(storePath(), `${JSON.stringify([...roots.values()], null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch (error) {
    console.warn('[workspace] could not persist approved roots:', error);
  }
}

export function listRoots(): WorkspaceRoot[] {
  load();
  return [...roots.values()].sort((a, b) => b.lastOpenedAtMs - a.lastOpenedAtMs);
}

export function getRoot(id: string): WorkspaceRoot | undefined {
  load();
  return roots.get(id) ?? worktrees.get(id);
}

export class WorktreeRootRefused extends Error {}

/**
 * Let a worktree of an approved folder be opened the way the folder is.
 *
 * The folder's grant covers the worktree only when the path the CLI named is
 * exactly a checkout it made for that folder: `<id>/checkout`, a linked git
 * worktree, beside a marker naming the same id and a repository the approved
 * folder sits in. Anything else, a renamed directory, a marker for another
 * repository, a plain folder, is refused, so this cannot widen a grant to an
 * arbitrary path.
 */
export async function admitWorktreeRoot(
  parentId: string,
  worktreeId: string,
  checkoutPath: string,
  name: string,
): Promise<WorkspaceRoot> {
  load();
  const parent = roots.get(parentId);
  const id = worktreeRootId(parentId, worktreeId);
  if (!parent || parseWorktreeRootId(id) === null) {
    throw new WorktreeRootRefused('That worktree does not belong to an approved folder.');
  }
  const refuse = (): never => {
    throw new WorktreeRootRefused(`${checkoutPath} is not a worktree made for ${parent.name}.`);
  };

  let resolved: string;
  let marker: unknown;
  let gitFile: string;
  try {
    resolved = await realpath(checkoutPath);
    if (!(await stat(resolved)).isDirectory()) refuse();
    const markerBytes = await readRegularFile(
      path.join(path.dirname(resolved), WORKTREE_MARKER),
      MARKER_READ_LIMIT,
    );
    const gitFileBytes = await readRegularFile(path.join(resolved, '.git'), GIT_FILE_READ_LIMIT);
    if (!markerBytes || !gitFileBytes) return refuse();
    marker = JSON.parse(markerBytes.toString('utf8'));
    gitFile = gitFileBytes.toString('utf8');
  } catch (error) {
    if (error instanceof WorktreeRootRefused) throw error;
    return refuse();
  }

  if (
    path.basename(resolved) !== WORKTREE_CHECKOUT ||
    path.basename(path.dirname(resolved)) !== worktreeId ||
    !gitFile.startsWith(GITDIR_PREFIX) ||
    typeof marker !== 'object' ||
    marker === null
  ) {
    return refuse();
  }
  const { id: markerId, repositoryRoot } = marker as { id?: unknown; repositoryRoot?: unknown };
  if (markerId !== worktreeId || typeof repositoryRoot !== 'string') return refuse();
  let repository: string;
  try {
    repository = await realpath(repositoryRoot);
  } catch {
    return refuse();
  }
  if (!isPathInside(repository, parent.path, { platform: currentPlatform() })) return refuse();

  const root: WorkspaceRoot = {
    id,
    path: resolved,
    name,
    grantedAtMs: parent.grantedAtMs,
    lastOpenedAtMs: parent.lastOpenedAtMs,
  };
  worktrees.set(id, root);
  return root;
}

export function forgetWorktreeRoot(id: string): void {
  worktrees.delete(id);
}

/**
 * Finds the approved root containing a resolved absolute path.
 *
 * The caller must have resolved symlinks first; a path that has not been
 * through `realpath` can point outside every root while appearing inside one.
 */
export function findContainingRoot(resolvedPath: string): WorkspaceRoot | undefined {
  load();
  for (const root of roots.values()) {
    if (isPathInside(root.path, resolvedPath, { platform: currentPlatform() })) return root;
  }
  return undefined;
}

export class WorkspaceGrantRefused extends Error {}

export async function grantRoot(selectedPath: string): Promise<WorkspaceRoot> {
  load();
  const resolved = await realpath(selectedPath);
  if (!isGrantableRoot(resolved, currentPlatform(), homeSpellings())) {
    throw new WorkspaceGrantRefused(
      "That location cannot be approved as a workspace: it is the system's, it holds your whole home folder, or it is where sign-ins and keys are kept. Choose a project folder instead.",
    );
  }

  const existing = [...roots.values()].find((root) => root.path === resolved);
  if (existing) {
    const touched: WorkspaceRoot = { ...existing, lastOpenedAtMs: Date.now() };
    roots.set(existing.id, touched);
    persist();
    return touched;
  }

  const now = Date.now();
  const root: WorkspaceRoot = {
    id: randomUUID(),
    path: resolved,
    name: path.basename(resolved) || resolved,
    grantedAtMs: now,
    lastOpenedAtMs: now,
  };
  roots.set(root.id, root);
  persist();
  return root;
}

/** The worktrees admitted for an approved folder in this run of the app. */
export function worktreeRootIds(parentId: string): string[] {
  return [...worktrees.keys()].filter(
    (worktreeId) => parseWorktreeRootId(worktreeId)?.rootId === parentId,
  );
}

/**
 * Withdraws a folder and every grant made on it. A grant left behind would
 * come back into force, unasked, the next time the same folder was approved.
 * A refusal made there stays until the user clears it.
 */
export function revokeRoot(id: string): boolean {
  load();
  for (const worktreeId of worktreeRootIds(id)) worktrees.delete(worktreeId);
  const root = roots.get(id);
  if (!root) return false;
  roots.delete(id);
  persist();
  revokeScope({ kind: 'workspace', target: root.path });
  return true;
}

export function touchRoot(id: string): void {
  load();
  const root = roots.get(id);
  if (!root) return;
  roots.set(id, { ...root, lastOpenedAtMs: Date.now() });
  persist();
}

export function setRootGit(id: string, gitRoot: string | undefined): void {
  load();
  const root = roots.get(id);
  if (!root) return;
  const next: WorkspaceRoot = { ...root };
  if (gitRoot) next.gitRoot = gitRoot;
  else delete next.gitRoot;
  roots.set(id, next);
  persist();
}
