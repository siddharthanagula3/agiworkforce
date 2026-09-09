import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WorkspaceRoot } from '@agiworkforce/local-runtime-contract';
import { assertNotDeniedFile, PathRefused, resolveWithinRoot } from '../runtime/pathGuard';

let sandbox: string;
let approved: string;
let outside: string;
let root: WorkspaceRoot;

beforeAll(async () => {
  sandbox = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-pathguard-')));
  approved = path.join(sandbox, 'approved');
  outside = path.join(sandbox, 'outside');

  await fs.mkdir(path.join(approved, 'src'), { recursive: true });
  await fs.mkdir(outside, { recursive: true });
  await fs.writeFile(path.join(approved, 'src', 'index.ts'), 'export const a = 1;\n');
  await fs.writeFile(path.join(outside, 'secrets.txt'), 'do not read me\n');

  await fs.symlink(outside, path.join(approved, 'escape-dir'), 'dir');
  await fs.symlink(path.join(outside, 'secrets.txt'), path.join(approved, 'escape-file'));

  root = {
    id: 'root-1',
    path: approved,
    name: 'approved',
    grantedAtMs: 0,
    lastOpenedAtMs: 0,
  };
});

afterAll(async () => {
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe('resolveWithinRoot', () => {
  it('resolves an ordinary file inside the root', async () => {
    const resolved = await resolveWithinRoot(root, 'src/index.ts');
    expect(resolved.relative).toBe('src/index.ts');
    expect(resolved.absolute).toBe(path.join(approved, 'src', 'index.ts'));
  });

  it('treats the empty path as the root itself', async () => {
    const resolved = await resolveWithinRoot(root, '');
    expect(resolved.relative).toBe('');
    expect(resolved.absolute).toBe(approved);
  });

  it('refuses a traversal segment', async () => {
    await expect(resolveWithinRoot(root, '../outside/secrets.txt')).rejects.toBeInstanceOf(
      PathRefused,
    );
    await expect(resolveWithinRoot(root, 'src/../../outside/secrets.txt')).rejects.toBeInstanceOf(
      PathRefused,
    );
  });

  it('refuses an absolute path even when it points inside the root', async () => {
    await expect(
      resolveWithinRoot(root, path.join(approved, 'src', 'index.ts')),
    ).rejects.toBeInstanceOf(PathRefused);
  });

  it('refuses a path containing a NUL byte', async () => {
    const truncation = `src/index.ts${String.fromCharCode(0)}.png`;
    await expect(resolveWithinRoot(root, truncation)).rejects.toBeInstanceOf(PathRefused);
  });

  it('refuses a file reached through a symlinked directory that escapes the root', async () => {
    await expect(resolveWithinRoot(root, 'escape-dir/secrets.txt')).rejects.toMatchObject({
      reason: 'outside-workspace',
    });
  });

  it('refuses a symlinked file whose target escapes the root', async () => {
    await expect(resolveWithinRoot(root, 'escape-file')).rejects.toMatchObject({
      reason: 'outside-workspace',
    });
  });

  it('allows a write target that does not exist yet', async () => {
    const resolved = await resolveWithinRoot(root, 'src/generated/new-file.ts');
    expect(resolved.relative).toBe('src/generated/new-file.ts');
  });

  it('refuses a not-yet-existing target underneath an escaping symlink', async () => {
    await expect(resolveWithinRoot(root, 'escape-dir/planted.txt')).rejects.toMatchObject({
      reason: 'outside-workspace',
    });
  });

  it('refuses every path once the root itself is gone', async () => {
    const missing: WorkspaceRoot = { ...root, path: path.join(sandbox, 'never-existed') };
    await expect(resolveWithinRoot(missing, 'src/index.ts')).rejects.toMatchObject({
      reason: 'outside-workspace',
    });
  });
});

describe('assertNotDeniedFile', () => {
  it('refuses credential files regardless of directory', () => {
    expect(() => assertNotDeniedFile('/anywhere/.env')).toThrow(PathRefused);
    expect(() => assertNotDeniedFile('/anywhere/nested/id_rsa')).toThrow(PathRefused);
    expect(() => assertNotDeniedFile('/anywhere/.NPMRC')).toThrow(PathRefused);
  });

  it('allows ordinary source files', () => {
    expect(() => assertNotDeniedFile('/anywhere/src/index.ts')).not.toThrow();
    expect(() => assertNotDeniedFile('/anywhere/.env.example')).not.toThrow();
  });
});
