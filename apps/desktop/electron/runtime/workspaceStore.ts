import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  isGrantableRoot,
  isPathInside,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';

const roots = new Map<string, WorkspaceRoot>();
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
    for (const entry of parsed) {
      if (isRootShape(entry)) roots.set(entry.id, entry);
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
  return roots.get(id);
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

  if (!isGrantableRoot(resolved, currentPlatform(), os.homedir())) {
    throw new WorkspaceGrantRefused(
      'That location is too broad to approve as a workspace. Choose a project folder inside it.',
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

export function revokeRoot(id: string): boolean {
  load();
  const removed = roots.delete(id);
  if (removed) persist();
  return removed;
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
