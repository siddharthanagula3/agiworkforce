/**
 * Regression tests for the `workspaceOnly` enforcement in `applyPatch()`.
 *
 * Background: prior versions of this package shipped `workspaceOnly` as a
 * type-only flag that no code ever read — an LLM-supplied patch could write
 * `../escape.txt` and the bridge would happily resolve it outside the
 * workspace. These tests pin the runtime guard so future refactors don't
 * silently regress the boundary.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPatch, WorkspaceEscapeError } from '../index';

let workspace: string;
let outsideAnchor: string;

beforeEach(async () => {
  // Two sibling tmp dirs: `workspace` (the cwd) and `outsideAnchor`
  // (a sibling we use to verify nothing landed there). The escape attempts
  // target paths that resolve relative to `workspace` but climb past it.
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
  // Best-effort cleanup; tests share /tmp so we do NOT recurse outside.
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
    // Confirm no file landed in the sibling directory.
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
    // First seed a legitimate file inside the workspace.
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
    // The caller-supplied bridge enforces its own boundary in this mode.
    const patch = [
      '*** Begin Patch',
      '*** Add File: still-inside.txt',
      '+inside',
      '*** End Patch',
    ].join('\n');

    const result = await applyPatch(patch, { cwd: workspace, workspaceOnly: false });
    expect(result.summary.added).toContain('still-inside.txt');
  });
});
