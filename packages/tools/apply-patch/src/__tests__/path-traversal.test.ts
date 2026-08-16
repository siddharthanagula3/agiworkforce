
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPatch, WorkspaceEscapeError } from '../index';
import type { FSBridge } from '../types';

let workspace: string;
let outsideAnchor: string;

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'apply-patch-traversal-'));
  workspace = resolve(root, 'workspace');
  outsideAnchor = resolve(root, 'outside');
  await import('node:fs/promises').then((fs) =>
    Promise.all([
      fs.mkdir(workspace, { recursive: true }),
      fs.mkdir(outsideAnchor, { recursive: true }),
    ]),
  );
});

afterEach(async () => {
  if (workspace && existsSync(workspace)) {
    await rm(resolve(workspace, '..'), { recursive: true, force: true });
  }
});

describe('applyPatch workspaceOnly enforcement', () => {
  it('rejects Add File with `../` traversal', async () => {
    const patch = [
      '*** Begin Patch',
      '*** Add File: ../escape.txt',
      '+pwned',
      '*** End Patch',
    ].join('\n');

    await expect(applyPatch(patch, { cwd: workspace })).rejects.toBeInstanceOf(
      WorkspaceEscapeError,
    );
    expect(existsSync(resolve(outsideAnchor, '..', 'escape.txt'))).toBe(false);
  });

  it('rejects Update File with deep `../../` traversal', async () => {
    const patch = [
      '*** Begin Patch',
      '*** Update File: ../../etc/passwd',
      '@@',
      '-old',
      '+new',
      '*** End Patch',
    ].join('\n');

    await expect(applyPatch(patch, { cwd: workspace })).rejects.toBeInstanceOf(
      WorkspaceEscapeError,
    );
  });

  it('rejects Add File with absolute path outside workspace', async () => {
    const patch = [
      '*** Begin Patch',
      `*** Add File: ${resolve(outsideAnchor, 'leak.txt')}`,
      '+pwned',
      '*** End Patch',
    ].join('\n');

    await expect(applyPatch(patch, { cwd: workspace })).rejects.toBeInstanceOf(
      WorkspaceEscapeError,
    );
    expect(existsSync(resolve(outsideAnchor, 'leak.txt'))).toBe(false);
  });

  it('rejects Update File with movePath that escapes', async () => {
    const seed = ['*** Begin Patch', '*** Add File: target.txt', '+hello', '*** End Patch'].join(
      '\n',
    );
    await applyPatch(seed, { cwd: workspace });

    const move = [
      '*** Begin Patch',
      '*** Update File: target.txt',
      '*** Move to: ../moved-out.txt',
      '@@',
      '-hello',
      '+goodbye',
      '*** End Patch',
    ].join('\n');

    await expect(applyPatch(move, { cwd: workspace })).rejects.toBeInstanceOf(WorkspaceEscapeError);
  });

  it('accepts Add File at the workspace root', async () => {
    const patch = [
      '*** Begin Patch',
      '*** Add File: legitimate.txt',
      '+hello world',
      '*** End Patch',
    ].join('\n');

    const result = await applyPatch(patch, { cwd: workspace });
    expect(result.summary.added).toContain('legitimate.txt');
    const written = await readFile(resolve(workspace, 'legitimate.txt'), 'utf-8');
    expect(written).toBe('hello world');
  });

  it('accepts Add File in nested subdirectory inside the workspace', async () => {
    const patch = [
      '*** Begin Patch',
      '*** Add File: nested/dir/file.txt',
      '+nested content',
      '*** End Patch',
    ].join('\n');

    const result = await applyPatch(patch, { cwd: workspace });
    expect(result.summary.added).toContain('nested/dir/file.txt');
    const written = await readFile(resolve(workspace, 'nested/dir/file.txt'), 'utf-8');
    expect(written).toBe('nested content');
  });

  it('allows opt-out with workspaceOnly: false (caller takes responsibility)', async () => {
    const patch = [
      '*** Begin Patch',
      '*** Add File: still-inside.txt',
      '+inside',
      '*** End Patch',
    ].join('\n');

    const result = await applyPatch(patch, { cwd: workspace, workspaceOnly: false });
    expect(result.summary.added).toContain('still-inside.txt');
  });

  it('rejects symlink escape (workspace contains symlink pointing outside)', async () => {
    const linkSource = resolve(workspace, 'escape-link');
    await symlink(outsideAnchor, linkSource, 'dir');

    const patch = [
      '*** Begin Patch',
      '*** Add File: escape-link/leak.txt',
      '+pwned via symlink',
      '*** End Patch',
    ].join('\n');

    await expect(applyPatch(patch, { cwd: workspace })).rejects.toBeInstanceOf(
      WorkspaceEscapeError,
    );
    expect(existsSync(resolve(outsideAnchor, 'leak.txt'))).toBe(false);
  });

  it('rejects path with `..` after a sibling-prefix (no partial-name aliasing)', async () => {
    // If the workspace lives at `/tmp/xxx/workspace`, an attacker might try
    const patch = [
      '*** Begin Patch',
      '*** Add File: ../workspace-evil/file.txt',
      '+pwned',
      '*** End Patch',
    ].join('\n');
    await expect(applyPatch(patch, { cwd: workspace })).rejects.toBeInstanceOf(
      WorkspaceEscapeError,
    );
  });

  it('error is a typed PatchError with code and attemptedPath', async () => {
    const patch = ['*** Begin Patch', '*** Add File: ../oops.txt', '+x', '*** End Patch'].join(
      '\n',
    );
    let caught: unknown;
    try {
      await applyPatch(patch, { cwd: workspace });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(WorkspaceEscapeError);
    const e = caught as WorkspaceEscapeError;
    expect(e.code).toBe('workspace_escape');
    expect(e.attemptedPath).toBe('../oops.txt');
    expect(e.name).toBe('WorkspaceEscapeError');
  });

  it('blocks an LLM-supplied custom FS bridge from being used to escape', async () => {
    const writes: string[] = [];
    const malicious: FSBridge = {
      async readFile() {
        return '';
      },
      async writeFile(path) {
        writes.push(path);
      },
      async remove() {},
      async mkdirp() {},
      async exists() {
        return false;
      },
    };
    const patch = ['*** Begin Patch', '*** Add File: ../escape.txt', '+x', '*** End Patch'].join(
      '\n',
    );
    await expect(applyPatch(patch, { cwd: workspace, fs: malicious })).rejects.toBeInstanceOf(
      WorkspaceEscapeError,
    );
    expect(writes).toEqual([]);
  });
});
