import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { pushLocalBranch } from '../runtime/gitService';

type ChildProcessModule = typeof import('node:child_process');
type ExecFileAsync = (
  file: string,
  args: readonly string[],
  options: object,
) => Promise<{ stdout: string; stderr: string }>;

const pushTargetRead = vi.hoisted(() => ({ hook: null as null | (() => void) }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<ChildProcessModule>();
  const { promisify } = await import('node:util');
  const runActual = promisify(actual.execFile) as unknown as ExecFileAsync;
  const readsPushTarget: ExecFileAsync = async (file, args, options) => {
    const result = await runActual(file, args, options);
    if (args.includes('get-url')) pushTargetRead.hook?.();
    return result;
  };
  const execFile = Object.assign(
    (...args: unknown[]) => (actual.execFile as (...forwarded: unknown[]) => unknown)(...args),
    { [promisify.custom]: readsPushTarget },
  );
  return { ...actual, default: { ...actual, execFile }, execFile };
});

let sandbox: string;
let fakeSsh: string;
const realHome = process.env['HOME'];
const realSshCommand = process.env['GIT_SSH_COMMAND'];
const realSshVariant = process.env['GIT_SSH_VARIANT'];

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

function remoteHeads(remote: string): string {
  return execFileSync('git', ['ls-remote', '--heads', remote], { encoding: 'utf8' });
}

async function exists(file: string): Promise<boolean> {
  return fs.stat(file).then(
    () => true,
    () => false,
  );
}

beforeAll(async () => {
  sandbox = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-git-race-')));
  await fs.mkdir(path.join(sandbox, 'home'));
  process.env['HOME'] = path.join(sandbox, 'home');
  fakeSsh = path.join(sandbox, 'fake-ssh.sh');
  await fs.writeFile(fakeSsh, '#!/bin/sh\nexec sh -c "$2"\n', { mode: 0o755 });
  process.env['GIT_SSH_COMMAND'] = `'${fakeSsh}'`;
  process.env['GIT_SSH_VARIANT'] = 'simple';
});

afterEach(() => {
  pushTargetRead.hook = null;
});

afterAll(async () => {
  for (const [name, value] of [
    ['HOME', realHome],
    ['GIT_SSH_COMMAND', realSshCommand],
    ['GIT_SSH_VARIANT', realSshVariant],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await fs.rm(sandbox, { recursive: true, force: true });
});

async function repositoryPushingOverSsh(
  name: string,
): Promise<{ dir: string; checked: string; marker: string }> {
  const dir = path.join(sandbox, name);
  await fs.mkdir(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  await fs.writeFile(path.join(dir, 'tracked.txt'), 'first\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'initial');
  const checked = path.join(sandbox, `${name}-checked.git`);
  git(sandbox, 'init', '-q', '--bare', checked);
  git(dir, 'remote', 'add', 'origin', `ssh://test.invalid${checked}`);
  return { dir, checked, marker: path.join(sandbox, `${name}-ran`) };
}

async function localRemoteWithHook(name: string, marker: string): Promise<string> {
  const local = path.join(sandbox, `${name}-local.git`);
  git(sandbox, 'init', '-q', '--bare', local);
  await fs.writeFile(path.join(local, 'hooks', 'pre-receive'), `#!/bin/sh\ntouch '${marker}'\n`, {
    mode: 0o755,
  });
  return local;
}

// llm-guardrail-allow: the planted hook and the stand-in ssh transport are POSIX shell scripts
describe.skipIf(process.platform === 'win32')(
  'a push whose repository settings change after its address was checked',
  () => {
    it('refuses a local folder origin now points at', async () => {
      const { dir, checked, marker } = await repositoryPushingOverSsh('race-path');
      const local = await localRemoteWithHook('race-path', marker);
      pushTargetRead.hook = () => git(dir, 'remote', 'set-url', 'origin', local);

      await expect(pushLocalBranch(dir)).rejects.toThrow("transport 'file' not allowed");
      expect(await exists(marker)).toBe(false);
      expect(remoteHeads(local)).toBe('');
      expect(remoteHeads(checked)).toBe('');
    });

    it('refuses a local folder even when the repository now allows the file transport', async () => {
      const { dir, checked, marker } = await repositoryPushingOverSsh('race-file-allowed');
      const local = await localRemoteWithHook('race-file-allowed', marker);
      pushTargetRead.hook = () => {
        git(dir, 'remote', 'set-url', 'origin', local);
        git(dir, 'config', 'protocol.file.allow', 'always');
      };

      await expect(pushLocalBranch(dir)).rejects.toThrow("transport 'file' not allowed");
      expect(await exists(marker)).toBe(false);
      expect(remoteHeads(local)).toBe('');
      expect(remoteHeads(checked)).toBe('');
    });

    it('refuses the ext helper even when the repository now allows it', async () => {
      const { dir, checked, marker } = await repositoryPushingOverSsh('race-ext-allowed');
      pushTargetRead.hook = () => {
        git(dir, 'remote', 'set-url', 'origin', `ext::sh -c touch% ${marker}`);
        git(dir, 'config', 'protocol.ext.allow', 'always');
      };

      await expect(pushLocalBranch(dir)).rejects.toThrow("transport 'ext' not allowed");
      expect(await exists(marker)).toBe(false);
      expect(remoteHeads(checked)).toBe('');
    });

    it('still pushes when nothing changed after the check', async () => {
      const { dir, checked } = await repositoryPushingOverSsh('race-none');
      await pushLocalBranch(dir);
      expect(remoteHeads(checked)).toContain('refs/heads/main');
    });
  },
);
