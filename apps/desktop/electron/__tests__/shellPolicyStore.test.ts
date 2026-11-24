import { promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let userData: string;
const beforeRename = vi.hoisted(() => vi.fn<(target: string) => void>());
type FileSystemModule = typeof import('node:fs');

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<FileSystemModule>();
  return {
    ...fs,
    renameSync: (...args: Parameters<typeof fs.renameSync>) => {
      beforeRename(String(args[1]));
      fs.renameSync(...args);
    },
  };
});

vi.mock('electron', () => ({ app: { getPath: () => userData } }));

beforeAll(async () => {
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'agi-policy-'));
});

afterAll(async () => {
  await fs.rm(userData, { recursive: true, force: true });
});

async function freshStore() {
  vi.resetModules();
  return import('../runtime/shellPolicyStore');
}

function storeFile(): string {
  return path.join(userData, 'desktop-shell-policy.json');
}

describe('shell policy store', () => {
  it('starts with nothing allowed and nothing denied', async () => {
    const { readShellPolicy } = await freshStore();
    expect(readShellPolicy()).toEqual({ allow: [], deny: [] });
  });

  it('persists a normalized policy and reads it back in a new session', async () => {
    const { writeShellPolicy } = await freshStore();
    writeShellPolicy({ allow: ['Git', '/usr/bin/git', 'pnpm'], deny: ['rm'] });

    const { readShellPolicy } = await freshStore();
    expect(readShellPolicy()).toEqual({ allow: ['git', 'pnpm'], deny: ['rm'] });
  });

  it('writes the file with owner-only permissions', async () => {
    const { writeShellPolicy } = await freshStore();
    writeShellPolicy({ allow: ['ls'], deny: [] });
    const stat = await fs.stat(storeFile());
    expect(stat.mode & 0o077).toBe(0);
  });

  it('hands back a copy, so a caller cannot mutate the stored policy', async () => {
    const { readShellPolicy, writeShellPolicy } = await freshStore();
    writeShellPolicy({ allow: ['ls'], deny: [] });
    readShellPolicy().allow.push('rm');
    expect(readShellPolicy()).toEqual({ allow: ['ls'], deny: [] });
  });

  it('treats a corrupt store as an empty one rather than crashing', async () => {
    await fs.writeFile(storeFile(), '{ not json');
    const { readShellPolicy } = await freshStore();
    expect(readShellPolicy()).toEqual({ allow: [], deny: [] });
  });

  it('ignores a stored policy of the wrong shape', async () => {
    await fs.writeFile(storeFile(), JSON.stringify({ allow: 'git', deny: [] }));
    const { readShellPolicy } = await freshStore();
    expect(readShellPolicy()).toEqual({ allow: [], deny: [] });
  });

  it('leaves valid JSON on disk after a write', async () => {
    const { writeShellPolicy } = await freshStore();
    writeShellPolicy({ allow: ['node'], deny: ['curl'] });
    expect(JSON.parse(readFileSync(storeFile(), 'utf8'))).toEqual({
      allow: ['node'],
      deny: ['curl'],
    });
  });

  it('leaves the previous rules active if the new policy cannot be saved', async () => {
    const { readShellPolicy, writeShellPolicy } = await freshStore();
    const previous = writeShellPolicy({ allow: ['git'], deny: ['curl'] });
    const original = readFileSync(storeFile(), 'utf8');
    let valueBeforeReplacement: string | undefined;
    beforeRename.mockImplementationOnce((target) => {
      valueBeforeReplacement = readFileSync(target, 'utf8');
      throw new Error('simulated rename failure');
    });

    const next = { allow: [], deny: ['git', 'curl'] };
    expect(() => writeShellPolicy(next)).toThrow('Could not save command permissions.');
    expect(valueBeforeReplacement).toBe(original);
    expect(readShellPolicy()).toEqual(previous);
    expect((await freshStore()).readShellPolicy()).toEqual(previous);
    expect((await fs.readdir(userData)).filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
    expect((await freshStore()).writeShellPolicy(next)).toEqual(next);
  });
});
