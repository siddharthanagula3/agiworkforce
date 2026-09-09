import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  countPorcelain,
  findRepositoryRoot,
  parseAheadBehind,
  readGitState,
} from '../runtime/gitService';

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

describe('countPorcelain', () => {
  it('reads the index column and the worktree column separately', () => {
    expect(countPorcelain([' M README.md'])).toEqual({ staged: 0, unstaged: 1, untracked: 0 });
    expect(countPorcelain(['A  staged.ts'])).toEqual({ staged: 1, unstaged: 0, untracked: 0 });
    expect(countPorcelain(['MM both.ts'])).toEqual({ staged: 1, unstaged: 1, untracked: 0 });
    expect(countPorcelain(['?? new.txt'])).toEqual({ staged: 0, unstaged: 0, untracked: 1 });
  });

  it('ignores lines too short to carry a status', () => {
    expect(countPorcelain(['', 'M'])).toEqual({ staged: 0, unstaged: 0, untracked: 0 });
  });
});

describe('parseAheadBehind', () => {
  it('reads behind from the left count and ahead from the right', () => {
    expect(parseAheadBehind('2\t5')).toEqual({ ahead: 5, behind: 2 });
    expect(parseAheadBehind('0\t0')).toEqual({ ahead: 0, behind: 0 });
  });

  it('falls back to zero for missing or unreadable input', () => {
    expect(parseAheadBehind(null)).toEqual({ ahead: 0, behind: 0 });
    expect(parseAheadBehind('nonsense')).toEqual({ ahead: 0, behind: 0 });
  });
});
