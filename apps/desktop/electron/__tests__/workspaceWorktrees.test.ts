import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let userData = '';

vi.mock('electron', () => ({
  app: { getPath: () => userData },
}));

const { WorktreeRootRefused, admitWorktreeRoot, getRoot, grantRoot, listRoots, revokeRoot } =
  await import('../runtime/workspaceStore');

const scratch: string[] = [];
const WORKTREE_ID = '0a1b2c3d';

function temp(prefix: string): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  scratch.push(dir);
  return dir;
}

function project(): string {
  const folder = path.join(temp('agi-repo-'), 'code', 'ledger');
  mkdirSync(folder, { recursive: true });
  return folder;
}

function checkout(
  repositoryRoot: string,
  { id = WORKTREE_ID, markerId = WORKTREE_ID, linked = true } = {},
): string {
  const reserved = path.join(temp('agi-worktrees-'), 'ledger-abc', id);
  const dir = path.join(reserved, 'checkout');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(reserved, 'worktree.json'),
    JSON.stringify({ id: markerId, repositoryRoot }),
  );
  if (linked) writeFileSync(path.join(dir, '.git'), `gitdir: ${repositoryRoot}/.git/worktrees/x\n`);
  return dir;
}

beforeEach(() => {
  userData = temp('agi-userdata-');
  for (const root of listRoots()) revokeRoot(root.id);
});

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('worktrees of an approved folder', () => {
  it('are covered by the folder grant once their checkout matches its marker', async () => {
    const parent = await grantRoot(project());
    const dir = checkout(parent.path);

    const admitted = await admitWorktreeRoot(parent.id, WORKTREE_ID, dir, 'ledger · worktree');

    expect(admitted.id).toBe(`${parent.id}::worktree::${WORKTREE_ID}`);
    expect(admitted.path).toBe(dir);
    expect(getRoot(admitted.id)).toEqual(admitted);
    expect(listRoots().map((root) => root.id)).toEqual([parent.id]);
  });

  it('refuse a checkout whose marker names another worktree', async () => {
    const parent = await grantRoot(project());
    const dir = checkout(parent.path, { markerId: 'ffffffff' });

    await expect(admitWorktreeRoot(parent.id, WORKTREE_ID, dir, 'x')).rejects.toBeInstanceOf(
      WorktreeRootRefused,
    );
  });

  it('refuse a worktree of a repository the approved folder is not in', async () => {
    const parent = await grantRoot(project());
    const dir = checkout(project());

    await expect(admitWorktreeRoot(parent.id, WORKTREE_ID, dir, 'x')).rejects.toBeInstanceOf(
      WorktreeRootRefused,
    );
  });

  it('refuse a plain folder dressed up with a marker', async () => {
    const parent = await grantRoot(project());
    const dir = checkout(parent.path, { linked: false });

    await expect(admitWorktreeRoot(parent.id, WORKTREE_ID, dir, 'x')).rejects.toBeInstanceOf(
      WorktreeRootRefused,
    );
  });

  it('refuse a path whose directory is not the id the CLI named', async () => {
    const parent = await grantRoot(project());
    const dir = checkout(parent.path, { id: 'eeeeeeee', markerId: WORKTREE_ID });

    await expect(admitWorktreeRoot(parent.id, WORKTREE_ID, dir, 'x')).rejects.toBeInstanceOf(
      WorktreeRootRefused,
    );
  });

  it('lose their cover when the folder is revoked', async () => {
    const parent = await grantRoot(project());
    const admitted = await admitWorktreeRoot(parent.id, WORKTREE_ID, checkout(parent.path), 'x');

    revokeRoot(parent.id);

    expect(getRoot(admitted.id)).toBeUndefined();
  });
});
