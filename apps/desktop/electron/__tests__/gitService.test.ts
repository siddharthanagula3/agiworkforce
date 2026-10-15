import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorkspaceRoot } from '@agiworkforce/local-runtime-contract';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  findRepositoryRoot,
  hostGitInvocation,
  readGitState,
  readWorkingTreeDiff,
  readWorkspaceGit,
} from '../runtime/gitService';

let sandbox: string;
let repo: string;
let plain: string;
const realHome = process.env['HOME'];

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

beforeAll(async () => {
  sandbox = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-git-')));
  await fs.mkdir(path.join(sandbox, 'home'));
  process.env['HOME'] = path.join(sandbox, 'home');
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
  process.env['HOME'] = realHome;
  await fs.rm(sandbox, { recursive: true, force: true });
});

async function committedRepo(name: string): Promise<string> {
  const dir = path.join(sandbox, name);
  await fs.mkdir(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  await fs.writeFile(path.join(dir, 'tracked.txt'), 'first\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'initial');
  return dir;
}

function workspaceRoot(dir: string): WorkspaceRoot {
  return {
    id: path.basename(dir),
    path: dir,
    name: path.basename(dir),
    grantedAtMs: 0,
    lastOpenedAtMs: 0,
  };
}

async function exists(file: string): Promise<boolean> {
  return fs.stat(file).then(
    () => true,
    () => false,
  );
}

async function withEnv<T>(values: Record<string, string>, body: () => Promise<T>): Promise<T> {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    return await body();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

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

describe('host git hardening', () => {
  it('disables every program git would run on its own, ahead of the subcommand', async () => {
    const invocation = await hostGitInvocation(repo, ['status', '--porcelain']);
    const hooks = path.join(sandbox, 'home', '.agiworkforce', 'git', 'no-hooks');
    expect(path.isAbsolute(invocation?.file ?? '')).toBe(true);
    expect(invocation?.args).toEqual([
      '-c',
      `core.hooksPath=${hooks}`,
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.untrackedCache=false',
      '-c',
      'core.attributesFile=/dev/null',
      '-c',
      'core.editor=true',
      '-c',
      'core.pager=cat',
      '--no-optional-locks',
      'status',
      '--porcelain',
    ]);
    expect(await fs.readdir(hooks)).toEqual([]);
    if (process.platform !== 'win32') expect((await fs.stat(hooks)).mode & 0o777).toBe(0o700);
  });

  it('passes git only the allowed environment', async () => {
    const env = await withEnv(
      {
        GIT_DIR: path.join(plain, 'elsewhere'),
        GIT_CONFIG_PARAMETERS: "'core.hookspath'='.husky'",
        GIT_CONFIG_GLOBAL: path.join(plain, 'global'),
        GIT_EXTERNAL_DIFF: 'touch',
        NODE_OPTIONS: '--inspect',
      },
      async () => (await hostGitInvocation(repo, ['status']))?.env,
    );
    const allowed = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT'];
    for (const key of Object.keys(env ?? {})) {
      expect([
        ...allowed,
        'GIT_CONFIG_NOSYSTEM',
        'GIT_ATTR_NOSYSTEM',
        'GIT_TERMINAL_PROMPT',
      ]).toContain(key);
    }
    expect(env?.['GIT_CONFIG_NOSYSTEM']).toBe('1');
  });

  it('ignores a GIT_DIR in the host environment', async () => {
    const state = await withEnv({ GIT_DIR: path.join(plain, 'missing') }, () => readGitState(repo));
    expect(state?.branch).toBe('main');
  });

  // llm-guardrail-allow: the planted hook is an executable POSIX shell script
  it.skipIf(process.platform === 'win32')(
    'does not run a post-index-change hook planted in the work tree',
    async () => {
      const dir = await committedRepo('husky');
      const marker = path.join(sandbox, 'husky-hook-ran');
      await fs.mkdir(path.join(dir, '.husky', '_'), { recursive: true });
      await fs.writeFile(
        path.join(dir, '.husky', '_', 'post-index-change'),
        `#!/bin/sh\ntouch '${marker}'\n`,
        { mode: 0o755 },
      );
      git(dir, 'config', 'core.hooksPath', '.husky/_');
      const later = new Date(Date.now() + 60_000);
      await fs.utimes(path.join(dir, 'tracked.txt'), later, later);

      expect((await readGitState(dir))?.branch).toBe('main');
      expect(await readWorkingTreeDiff(dir, ['tracked.txt'])).toBe('');
      expect(await exists(marker)).toBe(false);

      git(dir, 'status', '--porcelain');
      expect(await exists(marker)).toBe(true);
    },
  );

  it.each([
    ['filter.lfs.clean', 'touch'],
    ['filter.lfs.process', 'touch'],
    ['diff.pdf.textconv', 'touch'],
    ['diff.pdf.command', 'touch'],
    ['hook.lint.command', 'touch'],
    ['hook.lint.event', 'pre-commit'],
  ])('reports git as unavailable when the repository sets %s', async (key, value) => {
    const dir = await committedRepo(`config-${key}`);
    git(dir, 'config', key, value);
    expect(await findRepositoryRoot(dir)).toBe(dir);
    expect(await readGitState(dir)).toBeNull();
    expect(await readWorkingTreeDiff(dir, ['tracked.txt'])).toBeNull();
  });

  // llm-guardrail-allow: the planted filter is a POSIX shell command line
  it.skipIf(process.platform === 'win32')(
    'never runs a clean filter the repository defines',
    async () => {
      const dir = await committedRepo('filter-marker');
      const marker = path.join(sandbox, 'filter-ran');
      await fs.writeFile(path.join(dir, '.gitattributes'), '* filter=planted\n');
      git(dir, 'config', 'filter.planted.clean', `touch '${marker}'; cat`);
      await fs.appendFile(path.join(dir, 'tracked.txt'), 'second\n');
      expect(await readGitState(dir)).toBeNull();
      expect(await readWorkingTreeDiff(dir, ['tracked.txt'])).toBeNull();
      expect(await exists(marker)).toBe(false);

      git(dir, 'diff', '--', 'tracked.txt');
      expect(await exists(marker)).toBe(true);
    },
  );

  // llm-guardrail-allow: the planted filter is a POSIX shell command line
  it.skipIf(process.platform === 'win32')(
    'never runs a filter a redirected submodule gitfile names',
    async () => {
      const upstream = await committedRepo('submodule-upstream');
      const dir = await committedRepo('submodule-host');
      git(dir, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', upstream, 'sub');
      git(dir, 'commit', '-qm', 'add submodule');

      const marker = path.join(sandbox, 'submodule-filter-ran');
      const evil = path.join(dir, 'evilgit');
      await fs.cp(path.join(dir, '.git', 'modules', 'sub'), evil, { recursive: true });
      const evilConfig = path.join(evil, 'config');
      git(dir, 'config', '-f', evilConfig, '--unset', 'core.worktree');
      git(dir, 'config', '-f', evilConfig, 'filter.x.clean', `touch '${marker}'; cat`);
      await fs.writeFile(path.join(dir, 'sub', '.git'), 'gitdir: ../evilgit\n');
      await fs.writeFile(path.join(dir, 'sub', '.gitattributes'), '* filter=x\n');
      git(dir, 'config', '-f', '.gitmodules', 'submodule.sub.ignore', 'none');
      const later = new Date(Date.now() + 60_000);
      await fs.utimes(path.join(dir, 'sub', 'tracked.txt'), later, later);

      expect((await readGitState(dir))?.branch).toBe('main');
      expect(await readWorkingTreeDiff(dir, ['sub'])).toBe('');
      expect(await exists(marker)).toBe(false);

      git(dir, '-c', 'diff.ignoreSubmodules=all', 'status', '--porcelain');
      expect(await exists(marker)).toBe(true);
    },
  );

  // llm-guardrail-allow: the local-path submodule fixture is built for POSIX hosts only
  it.skipIf(process.platform === 'win32')(
    'reports a staged submodule commit change without reading the submodule',
    async () => {
      const upstream = await committedRepo('pointer-upstream');
      const dir = await committedRepo('pointer-host');
      git(dir, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', upstream, 'sub');
      git(dir, 'commit', '-qm', 'add submodule');
      git(
        path.join(dir, 'sub'),
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'moved',
      );
      git(dir, 'add', 'sub');

      expect((await readGitState(dir))?.staged).toBe(1);
    },
  );

  // llm-guardrail-allow: asserts POSIX PATH entries and #!/bin/sh stand-ins for git and ssh
  it.skipIf(process.platform === 'win32')(
    'gives git a PATH without the work tree or shared temp folders, and finds git on it',
    async () => {
      const dir = await committedRepo('path-clean');
      const venv = path.join(dir, '.venv', 'bin');
      const linked = path.join(sandbox, 'linked-bin');
      await fs.mkdir(venv, { recursive: true });
      for (const name of ['git', 'ssh']) {
        await fs.writeFile(path.join(venv, name), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      }
      await fs.symlink(venv, linked);
      const inherited = process.env['PATH'] ?? '';
      const invocation = await withEnv(
        {
          PATH: [
            venv,
            linked,
            '/tmp',
            '/private/tmp/bin',
            os.tmpdir(),
            'relative/bin',
            inherited,
          ].join(path.delimiter),
        },
        () => hostGitInvocation(dir, ['status']),
      );
      const entries = (invocation?.env['PATH'] ?? '').split(path.delimiter);
      expect(invocation?.file.startsWith(dir)).toBe(false);
      for (const removed of [
        venv,
        linked,
        '/tmp',
        '/private/tmp/bin',
        os.tmpdir(),
        'relative/bin',
      ]) {
        expect(entries).not.toContain(removed);
      }
      expect(entries).toContain(path.dirname(invocation?.file ?? ''));
      expect(entries.length).toBeGreaterThan(0);
    },
  );

  it('reports git as unavailable when its configuration includes a work-tree file', async () => {
    const dir = await committedRepo('include-inside');
    await fs.writeFile(path.join(dir, 'shared.gitconfig'), '[core]\n\tautocrlf = false\n');
    git(dir, 'config', 'include.path', '../shared.gitconfig');
    expect(await readGitState(dir)).toBeNull();
    expect(await readWorkspaceGit(workspaceRoot(dir))).toEqual({
      git: null,
      unavailableReason:
        'its repository settings read a file inside the folder (../shared.gitconfig from .git/config)',
    });
  });

  // llm-guardrail-allow: the includeIf gitdir fixtures use POSIX absolute paths
  describe.skipIf(process.platform === 'win32')('global config includes', () => {
    async function withGlobalInclude(
      name: string,
      includeDir: (dir: string) => Promise<string>,
    ): Promise<{ dir: string; marker: string; file: string }> {
      const dir = await committedRepo(name);
      const marker = path.join(sandbox, `${name}-ran`);
      const file = path.join(await includeDir(dir), '.gitconfig-work');
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, `[filter "planted"]\n\tclean = touch '${marker}'; cat\n`);
      await fs.writeFile(path.join(dir, '.gitattributes'), '* filter=planted\n');
      await fs.appendFile(path.join(dir, 'tracked.txt'), 'second\n');
      await fs.writeFile(
        path.join(sandbox, 'home', '.gitconfig'),
        `[includeIf "gitdir:${dir}/"]\n\tpath = ${file}\n`,
      );
      return { dir, marker, file };
    }

    afterEach(async () => {
      await fs.rm(path.join(sandbox, 'home', '.gitconfig'), { force: true });
    });

    it('refuses a code-running key from an included file inside the workspace', async () => {
      const { dir, marker, file } = await withGlobalInclude('global-include', async (d) => d);
      expect(await readWorkspaceGit(workspaceRoot(dir))).toEqual({
        git: null,
        unavailableReason: `its git settings run programs (filter.planted.clean in ${file}, a file a command can write)`,
      });
      expect(await exists(marker)).toBe(false);
    });

    it('stays available when the included file is outside every writable zone', async () => {
      const outside = await fs.mkdtemp(path.join(process.cwd(), '.agi-git-include-'));
      try {
        const { dir, marker } = await withGlobalInclude('global-include-outside', async () => {
          return outside;
        });
        expect((await readWorkspaceGit(workspaceRoot(dir))).git?.branch).toBe('main');
        expect(await exists(marker)).toBe(false);
      } finally {
        await fs.rm(outside, { recursive: true, force: true });
      }
    });
  });

  it('names the setting and the file that set it as the reason', async () => {
    const dir = await committedRepo('reason');
    git(dir, 'config', 'filter.lfs.clean', 'git-lfs clean -- %f');
    expect(await readWorkspaceGit(workspaceRoot(dir))).toEqual({
      git: null,
      unavailableReason: 'its repository settings run programs (filter.lfs.clean in .git/config)',
    });
  });

  it('treats git-lfs extension commands like filters', async () => {
    const dir = await committedRepo('lfs-extension');
    git(dir, 'config', 'lfs.extension.x.clean', 'touch planted');
    expect(await readWorkspaceGit(workspaceRoot(dir))).toEqual({
      git: null,
      unavailableReason:
        'its repository settings run programs (lfs.extension.x.clean in .git/config)',
    });
  });

  it('treats git-annex remote programs like filters', async () => {
    const dir = await committedRepo('annex-remote');
    git(dir, 'config', 'remote.origin.annex-shell', 'touch planted');
    expect(await readWorkspaceGit(workspaceRoot(dir))).toEqual({
      git: null,
      unavailableReason:
        'its repository settings run programs (remote.origin.annex-shell in .git/config)',
    });
  });

  it('gives no reason for a repository it can read', async () => {
    const read = await readWorkspaceGit(workspaceRoot(repo));
    expect(read.git?.branch).toBe('main');
    expect(read.unavailableReason).toBeUndefined();
  });

  it('reads diff paths literally, never as pathspec patterns', async () => {
    const dir = await committedRepo('literal');
    await fs.appendFile(path.join(dir, 'tracked.txt'), 'second\n');
    expect(await readWorkingTreeDiff(dir, ['tracked.txt'])).toContain('+second');
    expect(await readWorkingTreeDiff(dir, ['*.txt'])).toBe('');
    expect(await readWorkingTreeDiff(dir, [':(glob)**'])).toBe('');
  });

  it('keeps git available for an include outside the work tree that runs nothing', async () => {
    const dir = await committedRepo('include-outside');
    const outside = path.join(sandbox, 'outside.gitconfig');
    await fs.writeFile(outside, '[core]\n\tautocrlf = false\n');
    git(dir, 'config', 'include.path', outside);
    expect((await readGitState(dir))?.branch).toBe('main');
  });
});
