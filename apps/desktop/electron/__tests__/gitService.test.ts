import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findRepositoryRoot, readGitHeadLabel, readGitState } from '../runtime/gitService';

let repo: string;
let plain: string;

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

beforeAll(async () => {
  const sandbox = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-git-')));
  repo = path.join(sandbox, 'repo');
  plain = path.join(sandbox, 'plain');

  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.mkdir(plain, { recursive: true });

  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');

  await fs.writeFile(path.join(repo, 'README.md'), 'first\n');
  await fs.writeFile(path.join(repo, 'src', 'index.ts'), 'export const a = 1;\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'initial');

  await fs.appendFile(path.join(repo, 'README.md'), 'edited but not staged\n');
  await fs.writeFile(path.join(repo, 'staged.ts'), 'export const b = 2;\n');
  git(repo, 'add', 'staged.ts');
  await fs.writeFile(path.join(repo, 'untracked-one.txt'), 'x\n');
  await fs.writeFile(path.join(repo, 'untracked-two.txt'), 'y\n');
});

afterAll(async () => {
  await fs.rm(path.dirname(repo), { recursive: true, force: true });
});

describe('findRepositoryRoot', () => {
  it('finds the root from a subdirectory', async () => {
    expect(await findRepositoryRoot(path.join(repo, 'src'))).toBe(repo);
  });

  it('returns null outside a repository', async () => {
    expect(await findRepositoryRoot(plain)).toBeNull();
  });
});

describe('readGitState', () => {
  it('reports the branch and a real head sha', async () => {
    const state = await readGitState(repo);
    expect(state?.branch).toBe('main');
    expect(state?.detachedHead).toBe(false);
    expect(state?.headSha).toMatch(/^[0-9a-f]{40}$/);
  });

  /**
   * The counts were inverted in a live run: `git()` trimmed both ends, and
   * porcelain marks an unstaged edit with a leading space, so " M README.md"
   * became "M README.md" and every worktree change was reported as staged.
   */
  it('separates a staged addition from an unstaged edit', async () => {
    const state = await readGitState(repo);
    expect(state?.staged).toBe(1);
    expect(state?.unstaged).toBe(1);
    expect(state?.untracked).toBe(2);
  });

  it('reports no upstream and no remotes for a local-only repository', async () => {
    const state = await readGitState(repo);
    expect(state?.upstream).toBeNull();
    expect(state?.remotes).toEqual([]);
    expect(state?.ahead).toBe(0);
    expect(state?.behind).toBe(0);
  });

  it('reports no in-progress operation on a clean history', async () => {
    expect((await readGitState(repo))?.operation).toBe('none');
  });

  it('returns null outside a repository', async () => {
    expect(await readGitState(plain)).toBeNull();
  });
});

describe('readGitHeadLabel', () => {
  it('renders the head the way every other surface renders it', async () => {
    expect(await readGitHeadLabel(repo)).toBe('main');
    expect(await readGitHeadLabel(plain)).toBeNull();
  });
});
