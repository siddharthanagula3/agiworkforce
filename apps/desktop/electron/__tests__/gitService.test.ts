import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorkspaceRoot } from '@agiworkforce/local-runtime-contract';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  branchSlug,
  findRepositoryRoot,
  hostGitInvocation,
  listLocalBranches,
  pushLocalBranch,
  readGitState,
  readWorkingTreeChanges,
  readWorkingTreeDiff,
  readWorkspaceGit,
  switchLocalBranch,
} from '../runtime/gitService';

let sandbox: string;
let repo: string;
let plain: string;
let fakeSsh: string;
const realHome = process.env['HOME'];

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

function gitOutput(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trimEnd();
}

beforeAll(async () => {
  sandbox = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-git-')));
  await fs.mkdir(path.join(sandbox, 'home'));
  process.env['HOME'] = path.join(sandbox, 'home');
  repo = path.join(sandbox, 'repo');
  plain = path.join(sandbox, 'plain');

  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.mkdir(plain, { recursive: true });
  fakeSsh = path.join(sandbox, 'fake-ssh.sh');
  await fs.writeFile(fakeSsh, '#!/bin/sh\nexec sh -c "$2"\n', { mode: 0o755 });

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

function sshUrl(remote: string): string {
  return `ssh://test.invalid${remote}`;
}

function overSsh<T>(body: () => Promise<T>): Promise<T> {
  return withEnv({ GIT_SSH_COMMAND: `'${fakeSsh}'`, GIT_SSH_VARIANT: 'simple' }, body);
}

function remoteHeads(remote: string): string {
  return execFileSync('git', ['ls-remote', '--heads', remote], {
    encoding: 'utf8',
  });
}

async function submoduleHost(name: string): Promise<string> {
  const upstream = await committedRepo(`${name}-upstream`);
  const dir = await committedRepo(name);
  git(dir, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', upstream, 'sub');
  git(dir, 'commit', '-qm', 'add submodule');
  return dir;
}

async function commitInSubmodule(dir: string): Promise<void> {
  await fs.writeFile(path.join(dir, 'sub', 'tracked.txt'), 'moved\n');
  git(
    path.join(dir, 'sub'),
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-qam',
    'moved',
  );
  git(dir, 'add', 'sub');
  git(dir, 'commit', '-qm', 'move submodule');
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
      'submodule.recurse=false',
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

  // llm-guardrail-allow: the planted smudge filter is a POSIX shell command line
  it.skipIf(process.platform === 'win32')(
    'switches branches without checking out a submodule whose configuration names a filter',
    async () => {
      const dir = await submoduleHost('recurse-switch');
      git(dir, 'branch', 'before');
      await commitInSubmodule(dir);
      const marker = path.join(sandbox, 'recurse-switch-smudge-ran');
      const moduleDir = path.join(dir, '.git', 'modules', 'sub');
      git(
        dir,
        'config',
        '-f',
        path.join(moduleDir, 'config'),
        'filter.x.smudge',
        `touch '${marker}'; cat`,
      );
      await fs.mkdir(path.join(moduleDir, 'info'), { recursive: true });
      await fs.writeFile(path.join(moduleDir, 'info', 'attributes'), '* filter=x\n');
      git(dir, 'config', 'submodule.recurse', 'true');

      expect(await switchLocalBranch(dir, 'before')).toBe('before');
      expect(await exists(marker)).toBe(false);

      git(dir, 'submodule', 'update', '-q');
      expect(await exists(marker)).toBe(true);
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

describe('pushing with settings that route or secure the connection', () => {
  const settings: [string, string][] = [
    ['http.proxy', 'http://attacker.example:3128'],
    ['HTTP.SSLVerify', 'false'],
    ['http.sslCAInfo', '/tmp/ca.pem'],
    ['http.sslCAPath', '/tmp/ca'],
    ['http.https://Forge.Example/.sslVerify', 'false'],
    ['http.https://forge.example/.proxy', 'http://attacker.example:3128'],
    ['http.curloptResolve', 'forge.example:443:203.0.113.9'],
    ['http.sslVersion', 'tlsv1'],
    ['http.proxySSLCAInfo', '/tmp/ca.pem'],
    ['remote.origin.proxy', 'http://attacker.example:3128'],
    ['remote.origin.proxyAuthMethod', 'basic'],
    ['remote.origin.vcs', 'planted'],
    ['remote.origin.uploadpack', 'planted'],
    ['remote.origin.receivepack', 'planted'],
    ['core.sshCommand', 'planted'],
    ['credential.helper', '!planted'],
    ['credential.https://forge.example.helper', '!planted'],
    ['url.https://attacker.example/.insteadOf', 'https://forge.example/'],
    ['url.https://attacker.example/.pushInsteadOf', 'https://forge.example/'],
    ['protocol.ext.allow', 'always'],
    ['gpg.program', 'planted'],
    ['gpg.openpgp.program', 'planted'],
    ['gpg.x509.program', 'planted'],
    ['gpg.ssh.program', 'planted'],
    ['gpg.ssh.defaultKeyCommand', 'planted'],
  ];

  async function pushableRepo(name: string): Promise<{ dir: string; remote: string }> {
    const dir = await committedRepo(name);
    const remote = path.join(sandbox, `${name}.git`);
    git(sandbox, 'init', '-q', '--bare', remote);
    git(dir, 'remote', 'add', 'origin', sshUrl(remote));
    return { dir, remote };
  }

  it.each(settings)('refuses a push when the repository sets %s', async (key, value) => {
    const { dir, remote } = await pushableRepo(`route-${key.replace(/\W/g, '-')}`);
    git(dir, 'config', key, value);
    await expect(pushLocalBranch(dir)).rejects.toThrow('Git is off for this folder');
    expect(remoteHeads(remote)).toBe('');
  });

  it('names the setting and says what it changes', async () => {
    const { dir } = await pushableRepo('route-reason');
    git(dir, 'config', 'http.sslVerify', 'false');
    await expect(pushLocalBranch(dir)).rejects.toThrow(
      'its repository settings change where git sends credentials or how it checks the connection (http.sslverify in .git/config)',
    );
  });

  it('tells the user how to let a setting they added themselves through', async () => {
    const { dir } = await pushableRepo('route-remedy');
    git(dir, 'config', 'core.sshCommand', 'ssh -i ~/.ssh/work_key');
    const refused = await pushLocalBranch(dir).then(
      () => null,
      (error: Error) => error.message,
    );
    expect(refused).toBe(
      'Git is off for this folder: its repository settings run programs (core.sshcommand in .git/config). If you added that setting yourself, move it to your global git configuration (git config --global), which commands run in this folder cannot change, and try again.',
    );
  });

  it('never prints a credential written into the name of a setting', async () => {
    const { dir, remote } = await pushableRepo('route-credential-key');
    git(dir, 'config', 'http.https://alice:hunter2@forge.example/.sslVerify', 'false');
    const refused = await pushLocalBranch(dir).then(
      () => null,
      (error: Error) => error.message,
    );
    expect(refused).toContain('(http.https://(hidden)@forge.example/.sslverify in .git/config)');
    for (const secret of ['alice', 'hunter2']) expect(refused).not.toContain(secret);
    expect(remoteHeads(remote)).toBe('');
  });

  // llm-guardrail-allow: the stand-in ssh transport is a POSIX shell script
  it.skipIf(process.platform === 'win32')(
    'pushes with the extra header a CI checkout writes',
    async () => {
      const { dir, remote } = await pushableRepo('route-extraheader');
      git(dir, 'config', 'http.https://github.com/.extraheader', 'AUTHORIZATION: basic c2VjcmV0');
      git(dir, 'config', 'http.extraHeader', 'X-A: b');
      await overSsh(() => pushLocalBranch(dir));
      expect(remoteHeads(remote)).toContain('refs/heads/main');
    },
  );

  // llm-guardrail-allow: the stand-in ssh transport is a POSIX shell script
  it.skipIf(process.platform === 'win32')(
    'pushes to the push address and reports it, never the fetch address it hides behind',
    async () => {
      const { dir, remote } = await pushableRepo('route-pushurl');
      const elsewhere = path.join(sandbox, 'route-pushurl-elsewhere.git');
      git(sandbox, 'init', '-q', '--bare', elsewhere);
      git(dir, 'config', 'remote.origin.pushurl', sshUrl(elsewhere));
      const pushed = await overSsh(() => pushLocalBranch(dir));
      expect(pushed.remoteUrl).toBe(sshUrl(elsewhere));
      expect(remoteHeads(elsewhere)).toContain('refs/heads/main');
      expect(remoteHeads(remote)).toBe('');
    },
  );

  // llm-guardrail-allow: the stand-in ssh transport is a POSIX shell script
  it.skipIf(process.platform === 'win32')(
    'reports the address it pushed to without the password written into it',
    async () => {
      const { dir, remote } = await pushableRepo('route-userinfo');
      git(dir, 'remote', 'set-url', 'origin', `ssh://alice:hunter2@test.invalid${remote}`);
      const pushed = await overSsh(() => pushLocalBranch(dir));
      expect(pushed.remoteUrl).toBe(`ssh://alice@test.invalid${remote}`);
      expect(remoteHeads(remote)).toContain('refs/heads/main');
    },
  );

  // llm-guardrail-allow: the stand-in ssh transport is a POSIX shell script
  it.skipIf(process.platform === 'win32')(
    'never repeats a password from the address when the push fails',
    async () => {
      const { dir, remote } = await pushableRepo('route-userinfo-denied');
      const denyingSsh = path.join(sandbox, 'denying-ssh.sh');
      await fs.writeFile(
        denyingSsh,
        '#!/bin/sh\necho "$1: Permission denied (publickey)." >&2\nexit 255\n',
        { mode: 0o755 },
      );
      git(dir, 'remote', 'set-url', 'origin', `ssh://alice:hunter2@test.invalid${remote}`);
      const refused = await withEnv(
        { GIT_SSH_COMMAND: `'${denyingSsh}'`, GIT_SSH_VARIANT: 'simple' },
        () => pushLocalBranch(dir),
      ).then(
        () => null,
        (error: Error) => error.message,
      );
      expect(refused).toContain('alice@test.invalid: Permission denied');
      expect(refused).not.toContain('hunter2');
      expect(remoteHeads(remote)).toBe('');
    },
  );

  async function failedHttpsPush(name: string, branch: string, origin: string): Promise<string> {
    const dir = await committedRepo(name);
    git(dir, 'switch', '-q', '-c', branch);
    git(dir, 'remote', 'add', 'origin', origin);
    const refused = await withEnv({ NO_PROXY: '*', no_proxy: '*' }, () =>
      pushLocalBranch(dir),
    ).then(
      () => null,
      (error: Error) => error.message,
    );
    if (refused === null) throw new Error('The push to a closed port succeeded.');
    return refused;
  }

  it('keeps text that only ends with the user name of the address when the push fails', async () => {
    const refused = await failedHttpsPush(
      'route-userinfo-lookalike',
      'max@example.com',
      'https://x@127.0.0.1:1/octo/repo.git',
    );
    expect(refused).toContain('origin max@example.com');
    expect(refused).not.toContain('x@127.0.0.1');
  });

  it('removes the user name of the address wherever it stands on its own in a failed push', async () => {
    const refused = await failedHttpsPush(
      'route-userinfo-standalone',
      'ghp_planted@example.com',
      'https://ghp_planted@127.0.0.1:1/octo/repo.git',
    );
    expect(refused).toContain('origin example.com');
    expect(refused).not.toContain('ghp_planted');
  });

  it.each([
    [
      'https://x-access-token:ghp_planted@github.com/octo/repo.git',
      'https://github.com/octo/repo.git',
    ],
    ['https://ghp_planted@github.com/octo/repo.git', 'https://github.com/octo/repo.git'],
    ['ssh://git:planted@github.com/octo/repo.git', 'ssh://git@github.com/octo/repo.git'],
    ['ssh://git@github.com/octo/repo.git', 'ssh://git@github.com/octo/repo.git'],
    ['git@github.com:octo/repo.git', 'git@github.com:octo/repo.git'],
  ])('lists origin %s as %s', async (address, listed) => {
    const dir = await committedRepo(`branches-userinfo-${address.replace(/\W/g, '-')}`);
    git(dir, 'remote', 'add', 'origin', address);
    expect((await listLocalBranches(dir))?.remoteUrl).toBe(listed);
  });

  // llm-guardrail-allow: the stand-in ssh transport is a POSIX shell script
  it.skipIf(process.platform === 'win32')('pushes to an scp-style address', async () => {
    const { dir, remote } = await pushableRepo('route-scp');
    git(dir, 'remote', 'set-url', 'origin', `git@test.invalid:${remote}`);
    const pushed = await overSsh(() => pushLocalBranch(dir));
    expect(pushed.remoteUrl).toBe(`git@test.invalid:${remote}`);
    expect(remoteHeads(remote)).toContain('refs/heads/main');
  });

  // llm-guardrail-allow: the stand-in ssh transport is a POSIX shell script
  describe.skipIf(process.platform === 'win32')('other addresses git sends over ssh', () => {
    it.each<[string, (remote: string) => string]>([
      ['an scp-style address with no user, as a host alias is written', (r) => `test.invalid:${r}`],
      ['a git+ssh:// address', (r) => `git+ssh://test.invalid${r}`],
      ['an ssh+git:// address', (r) => `ssh+git://test.invalid${r}`],
      ['an scp-style address with a bracketed IPv6 host', (r) => `git@[::1]:${r}`],
    ])('pushes to %s', async (label, address) => {
      const { dir, remote } = await pushableRepo(`route-ssh-${label.replace(/\W/g, '-')}`);
      git(dir, 'remote', 'set-url', 'origin', address(remote));
      const pushed = await overSsh(() => pushLocalBranch(dir));
      expect(pushed.remoteUrl).toBe(address(remote));
      expect(remoteHeads(remote)).toContain('refs/heads/main');
    });
  });

  // llm-guardrail-allow: the planted receive hook is an executable POSIX shell script
  it.skipIf(process.platform === 'win32')(
    'never pushes to a repository on this computer, whose own hooks would run outside the sandbox',
    async () => {
      const { dir, remote } = await pushableRepo('route-local-hook');
      const marker = path.join(sandbox, 'route-local-hook-ran');
      await fs.writeFile(
        path.join(remote, 'hooks', 'pre-receive'),
        `#!/bin/sh\ntouch '${marker}'\n`,
        {
          mode: 0o755,
        },
      );
      git(dir, 'remote', 'set-url', 'origin', remote);
      const refused = await pushLocalBranch(dir).then(
        () => null,
        (error: Error) => error.message,
      );
      expect(refused).toBe(
        `Origin is a folder on this computer (${remote}), and pushing there runs that repository's own hooks on this computer, so nothing was pushed. Set origin to an https:// or ssh:// address and try again.`,
      );
      expect(await exists(marker)).toBe(false);
      expect(remoteHeads(remote)).toBe('');

      git(dir, 'push', '-q', 'origin', 'main');
      expect(await exists(marker)).toBe(true);
    },
  );

  it.each<[string, (dir: string, remote: string) => void, string]>([
    [
      'a file URL',
      (dir, remote) => git(dir, 'remote', 'set-url', 'origin', `file://${remote}`),
      'is a folder on this computer',
    ],
    [
      'a local push address behind a network fetch address',
      (dir, remote) => git(dir, 'config', 'remote.origin.pushurl', remote),
      'is a folder on this computer',
    ],
    [
      'a remote helper',
      (dir, remote) => git(dir, 'remote', 'set-url', 'origin', `ext::git-receive-pack ${remote}`),
      'pushes through the ext remote helper',
    ],
    [
      'a remote helper named like a host',
      (dir, remote) => git(dir, 'remote', 'set-url', 'origin', `test.invalid::${remote}`),
      'pushes through the test.invalid remote helper',
    ],
    [
      'an address whose scheme git hands to a remote helper',
      (dir, remote) => git(dir, 'remote', 'set-url', 'origin', `planted://test.invalid${remote}`),
      'is not an https:// or ssh:// address',
    ],
    [
      'a plain git address',
      (dir, remote) => git(dir, 'remote', 'set-url', 'origin', `git://test.invalid${remote}`),
      'is not an https:// or ssh:// address',
    ],
    [
      'a remote helper whose name starts with a digit',
      (dir, remote) => git(dir, 'remote', 'set-url', 'origin', `1x::${remote}`),
      'pushes through the 1x remote helper',
    ],
    [
      'an address whose scheme starts with a digit',
      (dir, remote) => git(dir, 'remote', 'set-url', 'origin', `9p://test.invalid${remote}`),
      'is not an https:// or ssh:// address',
    ],
    [
      'an address with a scheme git does not recognise as one',
      (dir, remote) => git(dir, 'remote', 'set-url', 'origin', `a_b://test.invalid${remote}`),
      'is not an https:// or ssh:// address',
    ],
    [
      'an scp-style address whose path starts with a second colon',
      (dir, remote) => git(dir, 'remote', 'set-url', 'origin', `git@test.invalid::${remote}`),
      'is not an https:// or ssh:// address',
    ],
  ])('refuses a push to %s', async (_label, point, reason) => {
    const { dir, remote } = await pushableRepo(`route-target-${_label.replace(/\W/g, '-')}`);
    point(dir, remote);
    await expect(overSsh(() => pushLocalBranch(dir))).rejects.toThrow(reason);
    expect(remoteHeads(remote)).toBe('');
  });

  describe.each([
    ['insteadOf', 'insteadOf'],
    ['pushInsteadOf', 'pushInsteadOf'],
  ])('a global %s rewrite', (_label, key) => {
    it('is judged as the address git pushes to', async () => {
      const { dir, remote } = await pushableRepo(`route-rewrite-${key}`);
      git(dir, 'remote', 'set-url', 'origin', `https://forge.example/${path.basename(remote)}`);
      const home = await fs.mkdtemp(path.join(process.cwd(), '.agi-git-home-'));
      try {
        await fs.writeFile(
          path.join(home, '.gitconfig'),
          `[url "${sandbox}/"]\n\t${key} = https://forge.example/\n`,
        );
        await expect(withEnv({ HOME: home }, () => pushLocalBranch(dir))).rejects.toThrow(
          `Origin is a folder on this computer (${remote})`,
        );
        expect(remoteHeads(remote)).toBe('');
      } finally {
        await fs.rm(home, { recursive: true, force: true });
      }
    });
  });

  // llm-guardrail-allow: the stand-in ssh transport is a POSIX shell script
  it.skipIf(process.platform === 'win32')(
    'pushes only the superproject when its settings ask to push submodules too',
    async () => {
      const dir = await submoduleHost('route-recurse');
      await commitInSubmodule(dir);
      const remote = path.join(sandbox, 'route-recurse.git');
      const subRemote = path.join(sandbox, 'route-recurse-sub.git');
      git(sandbox, 'init', '-q', '--bare', remote);
      git(sandbox, 'init', '-q', '--bare', subRemote);
      git(dir, 'remote', 'add', 'origin', sshUrl(remote));
      git(path.join(dir, 'sub'), 'remote', 'set-url', 'origin', sshUrl(subRemote));
      git(dir, 'config', 'push.recurseSubmodules', 'on-demand');

      await overSsh(() => pushLocalBranch(dir));
      expect(remoteHeads(remote)).toContain('refs/heads/main');
      expect(remoteHeads(subRemote)).toBe('');
    },
  );

  it('refuses a push that would go to more than one address', async () => {
    const { dir, remote } = await pushableRepo('route-pushurls');
    const first = path.join(sandbox, 'route-pushurls-first.git');
    const second = path.join(sandbox, 'route-pushurls-second.git');
    git(sandbox, 'init', '-q', '--bare', first);
    git(sandbox, 'init', '-q', '--bare', second);
    git(dir, 'config', '--add', 'remote.origin.pushurl', first);
    git(dir, 'config', '--add', 'remote.origin.pushurl', second);
    await expect(pushLocalBranch(dir)).rejects.toThrow('more than one address');
    for (const target of [remote, first, second]) expect(remoteHeads(target)).toBe('');
  });

  it('keeps status and diff available in a full clone, which never fetches for them', async () => {
    const dir = await committedRepo('route-status');
    git(dir, 'config', 'http.proxy', 'http://attacker.example:3128');
    git(dir, 'config', 'remote.origin.proxy', 'http://attacker.example:3128');
    git(dir, 'config', 'remote.origin.promisor', 'false');
    expect((await readWorkspaceGit(workspaceRoot(dir))).git?.branch).toBe('main');
  });

  it.each([
    ['remote.origin.promisor', 'true'],
    ['extensions.partialClone', 'origin'],
  ])('judges connection settings for status and diff once %s is set', async (key, value) => {
    const dir = await committedRepo(`route-promisor-${key.replace(/\W/g, '-')}`);
    git(dir, 'config', 'http.proxy', 'http://attacker.example:3128');
    git(dir, 'config', key, value);
    expect(await readWorkspaceGit(workspaceRoot(dir))).toEqual({
      git: null,
      unavailableReason:
        'its repository settings change where git sends credentials or how it checks the connection (http.proxy in .git/config)',
    });
    expect(await readWorkingTreeDiff(dir, ['tracked.txt'])).toBeNull();
  });

  // llm-guardrail-allow: the planted ssh command is an executable POSIX shell script
  it.skipIf(process.platform === 'win32')(
    'never runs an ssh command the repository names when a diff in a partial clone would fetch',
    async () => {
      const upstream = await committedRepo('lazy-upstream');
      await fs.writeFile(path.join(upstream, 'tracked.txt'), 'second\n');
      git(upstream, 'commit', '-qam', 'second');
      git(upstream, 'config', 'uploadpack.allowFilter', 'true');
      const dir = path.join(sandbox, 'lazy-clone');
      git(sandbox, 'clone', '-q', '--filter=blob:none', `file://${upstream}`, dir);
      git(dir, 'reset', '-q', '--soft', 'HEAD~1');
      const marker = path.join(sandbox, 'lazy-ssh-ran');
      const planted = path.join(sandbox, 'lazy-ssh.sh');
      await fs.writeFile(planted, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o755 });
      git(dir, 'config', 'remote.origin.url', 'ssh://planted.invalid/r');
      git(dir, 'config', 'core.sshCommand', planted);

      expect((await readWorkspaceGit(workspaceRoot(dir))).unavailableReason).toBe(
        'its repository settings run programs (core.sshcommand in .git/config)',
      );
      expect(await readWorkingTreeDiff(dir, ['tracked.txt'])).toBeNull();
      await expect(readWorkingTreeChanges(dir)).rejects.toThrow('Git is off for this folder');
      expect(await exists(marker)).toBe(false);

      expect(() => git(dir, 'diff', 'HEAD', '--', 'tracked.txt')).toThrow();
      expect(await exists(marker)).toBe(true);
    },
  );

  // llm-guardrail-allow: the planted ssh command is an executable POSIX shell script
  it.skipIf(process.platform === 'win32')(
    'never runs an ssh command the repository names when listing branches would fetch a missing tip',
    async () => {
      const dir = await committedRepo('lazy-branches');
      const marker = path.join(sandbox, 'lazy-branches-ssh-ran');
      const planted = path.join(sandbox, 'lazy-branches-ssh.sh');
      await fs.writeFile(planted, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o755 });
      git(dir, 'config', 'remote.origin.url', 'ssh://planted.invalid/r');
      git(dir, 'config', 'remote.origin.promisor', 'true');
      git(dir, 'config', 'core.sshCommand', planted);
      await fs.writeFile(
        path.join(dir, '.git', 'refs', 'heads', 'dangling'),
        `${'1'.repeat(40)}\n`,
      );

      await expect(listLocalBranches(dir)).rejects.toThrow(
        'Git is off for this folder: its repository settings run programs (core.sshcommand in .git/config).',
      );
      expect(await exists(marker)).toBe(false);

      expect(() =>
        git(
          dir,
          'for-each-ref',
          '--sort=-committerdate',
          '--format=%(refname:short)',
          'refs/heads',
        ),
      ).toThrow();
      expect(await exists(marker)).toBe(true);
    },
  );

  it('lists branches in a full clone whose connection settings a listing never obeys', async () => {
    const dir = await committedRepo('branches-full-clone');
    git(dir, 'branch', 'feature');
    git(dir, 'config', 'http.proxy', 'http://attacker.example:3128');
    git(dir, 'config', 'core.sshCommand', 'ssh -i ~/.ssh/work_key');
    expect((await listLocalBranches(dir))?.branches.sort()).toEqual(['feature', 'main']);
  });

  it.each([
    ['filter.lfs.clean', 'git-lfs clean -- %f'],
    ['diff.pdf.textconv', 'pdftotext'],
    ['hook.lint.command', 'lint'],
  ])(
    'lists branches in a full clone that sets %s, which a listing never runs',
    async (key, value) => {
      const dir = await committedRepo(`branches-full-${key.replace(/\W/g, '-')}`);
      git(dir, 'branch', 'feature');
      git(dir, 'config', key, value);
      expect((await listLocalBranches(dir))?.branches.sort()).toEqual(['feature', 'main']);
    },
  );

  it('refuses to list branches in a promisor clone that sets a filter', async () => {
    const dir = await committedRepo('branches-promisor-filter');
    git(dir, 'config', 'remote.origin.promisor', 'true');
    git(dir, 'config', 'filter.lfs.clean', 'git-lfs clean -- %f');
    await expect(listLocalBranches(dir)).rejects.toThrow(
      'Git is off for this folder: its repository settings run programs (filter.lfs.clean in .git/config).',
    );
  });

  // llm-guardrail-allow: the stand-in ssh transport is a POSIX shell script
  it.skipIf(process.platform === 'win32')(
    'pushes when the same settings come from the global configuration outside every writable zone',
    async () => {
      const { dir, remote } = await pushableRepo('route-global');
      const home = await fs.mkdtemp(path.join(process.cwd(), '.agi-git-home-'));
      try {
        await fs.writeFile(
          path.join(home, '.gitconfig'),
          '[http]\n\tproxy = http://corporate.example:3128\n\tsslVerify = true\n[http "https://forge.example/"]\n\tsslCAInfo = /etc/ssl/corporate.pem\n',
        );
        await overSsh(() => withEnv({ HOME: home }, () => pushLocalBranch(dir)));
        expect(remoteHeads(remote)).toContain('refs/heads/main');
      } finally {
        await fs.rm(home, { recursive: true, force: true });
      }
    },
  );
});
describe('opening a pull request from changes on no branch', () => {
  it('turns a title into a short branch-safe slug', () => {
    expect(branchSlug('Fix the sign-in screen!')).toBe('fix-the-sign-in-screen');
    expect(branchSlug('  Café  déjà vu  ')).toBe('cafe-deja-vu');
    expect(branchSlug('???')).toBe('changes');
    expect(branchSlug('a'.repeat(80))).toHaveLength(48);
  });

  // llm-guardrail-allow: the stand-in ssh transport is a POSIX shell script
  it.skipIf(process.platform === 'win32')(
    'creates a prefixed branch at HEAD, pushes it, and never reuses a taken name',
    async () => {
      const dir = await committedRepo('detached-push');
      const remote = path.join(sandbox, 'detached-remote.git');
      git(sandbox, 'init', '-q', '--bare', remote);
      git(dir, 'remote', 'add', 'origin', sshUrl(remote));
      git(dir, 'push', '-q', remote, 'main');
      git(dir, 'checkout', '-q', '--detach');

      const first = await overSsh(() =>
        pushLocalBranch(dir, { title: 'Fix sign-in', prefix: 'agi/' }),
      );
      expect(first.branch).toBe('agi/fix-sign-in');
      expect(remoteHeads(remote)).toContain('refs/heads/agi/fix-sign-in');

      git(dir, 'checkout', '-q', '--detach');
      const second = await overSsh(() =>
        pushLocalBranch(dir, { title: 'Fix sign-in', prefix: 'agi/' }),
      );
      expect(second.branch).toBe('agi/fix-sign-in-2');
    },
  );

  it.each<[string, (dir: string, remote: string) => void, string]>([
    [
      'origin is a folder on this computer',
      (dir, remote) => git(dir, 'remote', 'add', 'origin', remote),
      'is a folder on this computer',
    ],
    [
      'origin pushes through a remote helper',
      (dir, remote) => git(dir, 'remote', 'add', 'origin', `ext::git-receive-pack ${remote}`),
      'pushes through the ext remote helper',
    ],
    [
      'origin pushes to more than one address',
      (dir, remote) => {
        git(dir, 'remote', 'add', 'origin', sshUrl(remote));
        git(dir, 'config', '--add', 'remote.origin.pushurl', sshUrl(remote));
        git(dir, 'config', '--add', 'remote.origin.pushurl', `${sshUrl(remote)}-second`);
      },
      'more than one address',
    ],
    ['there is no origin', () => undefined, 'no origin remote'],
  ])('leaves the repository as it was when %s', async (label, point, reason) => {
    const dir = await committedRepo(`detached-refused-${label.replace(/\W/g, '-')}`);
    const remote = path.join(sandbox, `detached-refused-${label.replace(/\W/g, '-')}.git`);
    git(sandbox, 'init', '-q', '--bare', remote);
    point(dir, remote);
    git(dir, 'checkout', '-q', '--detach');
    const head = gitOutput(dir, 'rev-parse', 'HEAD');
    const branches = gitOutput(dir, 'for-each-ref', '--format=%(refname)', 'refs/heads');

    await expect(pushLocalBranch(dir, { title: 'Fix sign-in', prefix: 'agi/' })).rejects.toThrow(
      reason,
    );
    expect(gitOutput(dir, 'rev-parse', '--symbolic-full-name', 'HEAD')).toBe('HEAD');
    expect(gitOutput(dir, 'rev-parse', 'HEAD')).toBe(head);
    expect(gitOutput(dir, 'for-each-ref', '--format=%(refname)', 'refs/heads')).toBe(branches);
    expect(remoteHeads(remote)).toBe('');
  });

  it('still refuses changes on no branch when no new branch was asked for', async () => {
    const dir = await committedRepo('detached-refuse');
    const remote = path.join(sandbox, 'detached-refuse.git');
    git(sandbox, 'init', '-q', '--bare', remote);
    git(dir, 'remote', 'add', 'origin', remote);
    git(dir, 'checkout', '-q', '--detach');
    await expect(pushLocalBranch(dir)).rejects.toThrow('Check out a branch');
  });
});
