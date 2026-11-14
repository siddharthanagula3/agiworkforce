import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanStorage, readStorageUsage, type StorageEnvironment } from '../runtime/storageService';

let base: string;
let env: StorageEnvironment;
const clearWebCache = vi.fn(async () => undefined);
let runsActive = 0;

async function write(file: string, bytes: number, ageDays = 0): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.alloc(bytes));
  if (ageDays > 0) {
    const when = new Date(Date.now() - ageDays * 86_400_000);
    await fs.utimes(file, when, when);
  }
}

beforeEach(async () => {
  base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-storage-')));
  runsActive = 0;
  env = {
    cliHome: path.join(base, 'cli'),
    worktreesRoot: path.join(base, 'cli', 'worktrees'),
    userData: path.join(base, 'user-data'),
    logs: path.join(base, 'logs'),
    tempParents: [path.join(base, 'tmp')],
    webCacheBytes: async () => 300,
    clearWebCache,
    shellRunsActive: () => runsActive,
    now: Date.now,
  };
  await write(path.join(env.cliHome, 'managed_sessions', 's1.json'), 1_000);
  await write(path.join(env.cliHome, 'sessions.db'), 500);
  await write(path.join(env.worktreesRoot, 'repo-1', 'w1', 'checkout', 'a.ts'), 2_000);
  await write(path.join(env.logs, 'old.log'), 40, 10);
  await write(path.join(env.logs, 'today.log'), 60);
  await write(path.join(env.cliHome, 'plugins', 'cache', 'p.tgz'), 70);
  await write(path.join(env.userData, 'settings.json'), 900);
  await write(path.join(base, 'tmp', 'agi-shell-scratch-old', 'f'), 5, 3);
  await fs.utimes(
    path.join(base, 'tmp', 'agi-shell-scratch-old'),
    new Date(Date.now() - 3 * 86_400_000),
    new Date(Date.now() - 3 * 86_400_000),
  );
  await write(path.join(base, 'tmp', 'agi-shell-scratch-new', 'f'), 7);
});

afterEach(async () => {
  vi.clearAllMocks();
  await fs.rm(base, { recursive: true, force: true });
});

function bytesOf(usage: Awaited<ReturnType<typeof readStorageUsage>>, category: string): number {
  return usage.categories.find((row) => row.category === category)?.bytes ?? -1;
}

describe('measuring what the app keeps on disk', () => {
  it('reports each category and a total that adds up', async () => {
    const usage = await readStorageUsage(env);
    expect(bytesOf(usage, 'sessions')).toBe(1_500);
    expect(bytesOf(usage, 'worktrees')).toBe(2_000);
    expect(bytesOf(usage, 'logs')).toBe(100);
    expect(bytesOf(usage, 'caches')).toBe(82);
    expect(bytesOf(usage, 'web-cache')).toBe(300);
    expect(usage.totalBytes).toBe(usage.categories.reduce((sum, row) => sum + row.bytes, 0));
    expect(usage.dataPath).toBe(env.cliHome);
  });

  it('does not follow links out of the folders it measures', async () => {
    const outside = path.join(base, 'outside');
    await write(path.join(outside, 'big.bin'), 50_000);
    await fs.symlink(outside, path.join(env.worktreesRoot, 'link'));
    const usage = await readStorageUsage(env);
    expect(bytesOf(usage, 'worktrees')).toBe(2_000);
  });
});

describe('cleaning up', () => {
  it('removes only logs older than a week', async () => {
    await cleanStorage(env, 'old-logs');
    await expect(fs.stat(path.join(env.logs, 'old.log'))).rejects.toThrow();
    await expect(fs.stat(path.join(env.logs, 'today.log'))).resolves.toBeTruthy();
  });

  it('clears the web cache through the session', async () => {
    await cleanStorage(env, 'web-cache');
    expect(clearWebCache).toHaveBeenCalledTimes(1);
  });

  it('removes old command scratch folders and keeps recent ones', async () => {
    await cleanStorage(env, 'shell-scratch');
    await expect(fs.stat(path.join(base, 'tmp', 'agi-shell-scratch-old'))).rejects.toThrow();
    await expect(fs.stat(path.join(base, 'tmp', 'agi-shell-scratch-new'))).resolves.toBeTruthy();
  });

  it('refuses to touch scratch folders while a command runs', async () => {
    runsActive = 1;
    await expect(cleanStorage(env, 'shell-scratch')).rejects.toThrow('A command is running');
    await expect(fs.stat(path.join(base, 'tmp', 'agi-shell-scratch-old'))).resolves.toBeTruthy();
  });
});
