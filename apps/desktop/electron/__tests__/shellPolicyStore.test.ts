import { promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let userData: string;

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
});
