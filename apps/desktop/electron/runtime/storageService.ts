import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  OLD_LOG_AGE_DAYS,
  type StorageCategory,
  type StorageCategoryUsage,
  type StorageCleanup,
  type StorageUsage,
} from '@agiworkforce/local-runtime-contract';

const DAY_MS = 86_400_000;
const WALK_ENTRY_LIMIT = 400_000;
const WALK_DEPTH_LIMIT = 48;
const SCRATCH_PREFIX = 'agi-shell-scratch-';
const SCRATCH_MIN_AGE_MS = DAY_MS;

export interface StorageEnvironment {
  cliHome: string;
  worktreesRoot: string;
  userData: string;
  logs: string;
  tempParents: string[];
  webCacheBytes: () => Promise<number>;
  clearWebCache: () => Promise<void>;
  shellRunsActive: () => number;
  now: () => number;
}

interface Measured {
  bytes: number;
  partial: boolean;
}

interface WalkBudget {
  entries: number;
}

async function measure(target: string, budget: WalkBudget, depth = 0): Promise<Measured> {
  let stat;
  try {
    stat = await fs.lstat(target);
  } catch {
    return { bytes: 0, partial: false };
  }
  budget.entries -= 1;
  if (budget.entries < 0) return { bytes: 0, partial: true };
  if (stat.isSymbolicLink()) return { bytes: 0, partial: false };
  if (!stat.isDirectory()) return { bytes: stat.size, partial: false };
  if (depth >= WALK_DEPTH_LIMIT) return { bytes: 0, partial: true };
  let names: string[];
  try {
    names = await fs.readdir(target);
  } catch {
    return { bytes: 0, partial: false };
  }
  let bytes = 0;
  let partial = false;
  for (const name of names) {
    const child = await measure(path.join(target, name), budget, depth + 1);
    bytes += child.bytes;
    partial ||= child.partial;
    if (budget.entries < 0) return { bytes, partial: true };
  }
  return { bytes, partial };
}

async function measureAll(targets: string[], budget: WalkBudget): Promise<Measured> {
  let bytes = 0;
  let partial = false;
  for (const target of targets) {
    const result = await measure(target, budget);
    bytes += result.bytes;
    partial ||= result.partial;
  }
  return { bytes, partial };
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function scratchFolders(env: StorageEnvironment): Promise<string[]> {
  const found: string[] = [];
  for (const parent of env.tempParents) {
    let names: string[];
    try {
      names = await fs.readdir(parent);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name.startsWith(SCRATCH_PREFIX)) found.push(path.join(parent, name));
    }
  }
  return found;
}

export async function readStorageUsage(env: StorageEnvironment): Promise<StorageUsage> {
  const budget: WalkBudget = { entries: WALK_ENTRY_LIMIT };
  const sessions = await measureAll(
    ['managed_sessions', 'sessions.db', 'sessions.db-wal', 'sessions.db-shm', 'history.jsonl'].map(
      (name) => path.join(env.cliHome, name),
    ),
    budget,
  );
  const worktrees = await measure(env.worktreesRoot, budget);
  const logs = isInside(env.logs, env.userData)
    ? { bytes: 0, partial: false }
    : await measure(env.logs, budget);
  const caches = await measureAll(
    [
      path.join(env.cliHome, 'plugins', 'cache'),
      path.join(env.cliHome, 'shell_snapshots'),
      ...(await scratchFolders(env)),
    ],
    budget,
  );
  const userData = await measure(env.userData, budget);
  const webCache = Math.max(0, await env.webCacheBytes().catch(() => 0));
  const userDataLogs = isInside(env.logs, env.userData) ? await measure(env.logs, budget) : null;

  const rows: Array<[StorageCategory, Measured]> = [
    ['sessions', sessions],
    ['worktrees', worktrees],
    ['web-cache', { bytes: webCache, partial: false }],
    ['logs', userDataLogs ?? logs],
    ['caches', caches],
    [
      'app-data',
      {
        bytes: Math.max(0, userData.bytes - webCache - (userDataLogs?.bytes ?? 0)),
        partial: userData.partial,
      },
    ],
  ];
  const categories: StorageCategoryUsage[] = rows.map(([category, value]) => ({
    category,
    bytes: value.bytes,
    partial: value.partial,
  }));
  return {
    categories,
    totalBytes: categories.reduce((sum, row) => sum + row.bytes, 0),
    dataPath: env.cliHome,
    measuredAtMs: env.now(),
  };
}

async function removeOldFiles(directory: string, olderThanMs: number): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await removeOldFiles(target, olderThanMs);
      continue;
    }
    const stat = await fs.lstat(target).catch(() => null);
    if (stat && stat.mtimeMs < olderThanMs) await fs.rm(target, { force: true });
  }
}

export class StorageCleanupRefused extends Error {}

export type FileCleanup = Exclude<StorageCleanup, 'archived-sessions'>;

export async function cleanStorage(
  env: StorageEnvironment,
  cleanup: FileCleanup,
): Promise<StorageUsage> {
  switch (cleanup) {
    case 'web-cache':
      await env.clearWebCache();
      break;
    case 'old-logs':
      await removeOldFiles(env.logs, env.now() - OLD_LOG_AGE_DAYS * DAY_MS);
      break;
    case 'shell-scratch': {
      if (env.shellRunsActive() > 0) {
        throw new StorageCleanupRefused(
          'A command is running. Clear temporary command files after it finishes.',
        );
      }
      const cutoff = env.now() - SCRATCH_MIN_AGE_MS;
      for (const folder of await scratchFolders(env)) {
        const stat = await fs.lstat(folder).catch(() => null);
        if (stat?.isDirectory() && !stat.isSymbolicLink() && stat.mtimeMs < cutoff) {
          await fs.rm(folder, { recursive: true, force: true });
        }
      }
      break;
    }
  }
  return readStorageUsage(env);
}

export function defaultTempParents(): string[] {
  const system = os.tmpdir();
  const uid = process.getuid?.() ?? -1;
  return [system, path.join(system, `agi-shell-${uid}`)];
}
