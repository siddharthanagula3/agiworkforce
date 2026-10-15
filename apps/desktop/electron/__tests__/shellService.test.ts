import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_SHELL_POLICY,
  ShellCommandRefused,
  type ShellPolicy,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import { PathRefused } from '../runtime/pathGuard';
import {
  cancelAllShellRuns,
  cancelShellRun,
  shellRunsIn,
  childEnvironment,
  INHERITED_ENV_ALLOWLIST,
  isWithheldVariable,
  runShellCommand,
  type ShellStreamChunk,
} from '../runtime/shellService';
import { detectShellSandbox, type ShellSandbox } from '../runtime/shellSandbox';

let sandbox: string;
let root: WorkspaceRoot;
let hostSandbox: ShellSandbox;

const allowEverything: ShellPolicy = { allow: ['node', 'printf', 'sh'], deny: [] };

function run(
  command: string,
  options: {
    policy?: ShellPolicy;
    approve?: boolean;
    relativePath?: string;
    timeoutMs?: number;
    chunks?: ShellStreamChunk[];
    runId?: string;
  } = {},
) {
  const chunks = options.chunks ?? [];
  return runShellCommand({
    runId: options.runId ?? randomUUID(),
    root,
    relativePath: options.relativePath ?? '',
    command,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    policy: options.policy ?? allowEverything,
    sandbox: hostSandbox,
    approve: vi.fn().mockResolvedValue({
      approved: options.approve ?? hostSandbox.backend === 'none',
      allowNetwork: false,
    }),
    emit: (chunk) => chunks.push(chunk),
  });
}

beforeAll(async () => {
  hostSandbox = await detectShellSandbox();
  sandbox = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-shell-')));
  await fs.mkdir(path.join(sandbox, 'inner'), { recursive: true });
  await fs.writeFile(path.join(sandbox, 'marker.txt'), 'present\n');
  root = { id: 'r', path: sandbox, name: 'sandbox', grantedAtMs: 0, lastOpenedAtMs: 0 };
});

afterAll(async () => {
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe('runShellCommand', () => {
  it('runs an allow-listed program and returns its output', async () => {
    const chunks: ShellStreamChunk[] = [];
    const result = await run('node -e "console.log(40+2)"', { chunks });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('42');
    expect(result.program).toBe('node');
    expect(chunks.some((chunk) => chunk.stream === 'stdout' && chunk.chunk.includes('42'))).toBe(
      true,
    );
    expect(chunks.every((chunk) => chunk.runId === result.runId)).toBe(true);
  });

  it('reports a non-zero exit rather than throwing', async () => {
    const result = await run('node -e "process.exit(3)"');
    expect(result.exitCode).toBe(3);
  });

  it('separates stderr from stdout', async () => {
    const result = await run('node -e "console.error(\'bad\')"');
    expect(result.stderr.trim()).toBe('bad');
    expect(result.stdout).toBe('');
  });

  it('runs in a subfolder of the approved root', async () => {
    const result = await run('node -e "console.log(process.cwd())"', { relativePath: 'inner' });
    expect(result.cwd).toBe('inner');
    expect(result.stdout.trim().endsWith('inner')).toBe(true);
  });

  it('refuses a working directory outside the approved root', async () => {
    await expect(run('node -e "1"', { relativePath: '../elsewhere' })).rejects.toBeInstanceOf(
      PathRefused,
    );
  });

  it('refuses a working directory that is a file', async () => {
    await expect(run('node -e "1"', { relativePath: 'marker.txt' })).rejects.toBeInstanceOf(
      PathRefused,
    );
  });

  it('refuses shell control characters instead of running them literally', async () => {
    await expect(run('node -e "1" ; rm -rf /')).rejects.toMatchObject({
      name: 'ShellCommandRefused',
      reason: 'control-characters',
    });
  });

  it('refuses a program the policy denies without prompting', async () => {
    const approve = vi.fn();
    await expect(
      runShellCommand({
        runId: randomUUID(),
        root,
        relativePath: '',
        command: 'node -e "1"',
        policy: { allow: [], deny: ['node'] },
        sandbox: hostSandbox,
        approve,
        emit: () => undefined,
      }),
    ).rejects.toBeInstanceOf(ShellCommandRefused);
    expect(approve).not.toHaveBeenCalled();
  });

  it('asks before running an unlisted program and honours a refusal', async () => {
    const approve = vi.fn().mockResolvedValue({ approved: false, allowNetwork: false });
    await expect(
      runShellCommand({
        runId: randomUUID(),
        root,
        relativePath: '',
        command: 'node -e "1"',
        policy: EMPTY_SHELL_POLICY,
        sandbox: hostSandbox,
        approve,
        emit: () => undefined,
      }),
    ).rejects.toBeInstanceOf(ShellCommandRefused);
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it('runs an unlisted program once the user approves it', async () => {
    const result = await run('node -e "console.log(1)"', {
      policy: EMPTY_SHELL_POLICY,
      approve: true,
    });
    expect(result.exitCode).toBe(0);
  });

  it('does not ask again for an allow-listed program when a sandbox is available', async (context) => {
    if (hostSandbox.backend === 'none') context.skip();
    const approve = vi.fn();
    const result = await runShellCommand({
      runId: randomUUID(),
      root,
      relativePath: '',
      command: 'node -e "console.log(1)"',
      policy: allowEverything,
      sandbox: hostSandbox,
      approve,
      emit: () => undefined,
    });
    expect(approve).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
  });

  it('asks for an allow-listed program when the server set a review for the step', async () => {
    const approve = vi.fn().mockResolvedValue(false);
    await expect(
      runShellCommand({
        runId: randomUUID(),
        root,
        relativePath: '',
        command: 'node -e "console.log(1)"',
        policy: allowEverything,
        sandbox: hostSandbox,
        network: 'deny',
        approve,
        emit: () => undefined,
        review: 'Run node in sandbox',
      }),
    ).rejects.toThrow();
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it('reports a missing program as a refusal, not a crash', async () => {
    await expect(
      run('node-that-does-not-exist --version', { policy: { allow: [], deny: [] }, approve: true }),
    ).rejects.toBeInstanceOf(ShellCommandRefused);
  });

  it('stops a command that outruns its timeout', async () => {
    const result = await run('node -e "setTimeout(()=>{},10000)"', { timeoutMs: 300 });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  it('cancels a running command by the id the caller chose', async () => {
    const runId = randomUUID();
    const chunks: ShellStreamChunk[] = [];
    const pending = run('node -e "console.log(\'go\');setTimeout(()=>{},10000)"', {
      chunks,
      runId,
    });
    await vi.waitFor(() => expect(chunks.length).toBeGreaterThan(0));
    expect(chunks[0]!.runId).toBe(runId);
    expect(shellRunsIn(root.id)).toEqual([runId]);
    expect(shellRunsIn('another-folder')).toEqual([]);
    expect(cancelShellRun(runId)).toBe(true);
    const result = await pending;
    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toBe(false);
    expect(shellRunsIn(root.id)).toEqual([]);
  });

  it('refuses a second run under an id whose first run has not started yet, and loses track of neither', async () => {
    const runId = randomUUID();
    const first: { answer?: (answer: { approved: boolean; allowNetwork: boolean }) => void } = {};
    const waiting = runShellCommand({
      runId,
      root,
      relativePath: '',
      command: 'node -e "console.log(1)"',
      policy: { allow: [], deny: [] },
      sandbox: hostSandbox,
      approve: () =>
        new Promise((resolve) => {
          first.answer = resolve;
        }),
      emit: () => undefined,
    });
    const settled = waiting.then(
      (result) => result,
      (error: unknown) => error,
    );

    await expect(run('node -e "console.log(2)"', { runId })).rejects.toThrow(/already running/u);
    expect(shellRunsIn(root.id)).toEqual([runId]);

    expect(cancelShellRun(runId)).toBe(true);
    await vi.waitFor(() => expect(first.answer).toBeDefined());
    first.answer?.({ approved: true, allowNetwork: false });

    const outcome = await settled;
    expect(outcome).toBeInstanceOf(ShellCommandRefused);
    expect((outcome as Error).message).toBe('That command was cancelled before it started.');
    expect(shellRunsIn(root.id)).toEqual([]);

    const again = await run('node -e "console.log(3)"', { runId });
    expect(again.stdout.trim()).toBe('3');
  });

  it('reports an unknown run id as nothing to cancel', () => {
    expect(cancelShellRun('not-a-run')).toBe(false);
  });

  it('truncates output that exceeds the cap and stops the command', async () => {
    const result = await run(
      'node -e "const l=\'x\'.repeat(100000);for(let i=0;i<40;i+=1)console.log(l)"',
    );
    expect(result.truncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(1_100_000);
  });

  it('passes quoted arguments through as one argument', async () => {
    const result = await run('node -e "console.log(process.argv[1])" "two words"');
    expect(result.stdout.trim()).toBe('two words');
  });
});

describe('childEnvironment', () => {
  const parent: NodeJS.ProcessEnv = {
    PATH: '/usr/bin:/bin',
    HOME: '/Users/someone',
    LANG: 'en_US.UTF-8',
    LC_MESSAGES: 'en_US.UTF-8',
    TMPDIR: '/var/folders/x/T/',
    DYLD_INSERT_LIBRARIES: '/tmp/inject.dylib',
    DYLD_LIBRARY_PATH: '/tmp',
    LD_PRELOAD: '/tmp/inject.so',
    NODE_OPTIONS: '--require /tmp/hook.js',
    ELECTRON_RUN_AS_NODE: '1',
    SSH_AUTH_SOCK: '/private/tmp/ssh-agent.sock',
    HTTPS_PROXY: 'http://proxy.test:8080',
    http_proxy: 'http://proxy.test:8080',
    NO_PROXY: 'localhost',
    all_proxy: 'socks5://proxy.test:1080',
    LC_TOKEN: 'smuggled',
    OPENAI_API_KEY: 'sk-test',
    GITHUB_TOKEN: 'ghp_test',
    AWS_SECRET_ACCESS_KEY: 'secret',
  };

  it('passes the allow-listed variables and drops loader hooks and secrets', () => {
    expect(childEnvironment(null, parent, 'darwin')).toEqual({
      PATH: '/usr/bin:/bin',
      HOME: '/Users/someone',
      LANG: 'en_US.UTF-8',
      LC_MESSAGES: 'en_US.UTF-8',
      TMPDIR: '/var/folders/x/T/',
      SSH_AUTH_SOCK: '/private/tmp/ssh-agent.sock',
      HTTPS_PROXY: 'http://proxy.test:8080',
      http_proxy: 'http://proxy.test:8080',
      NO_PROXY: 'localhost',
      all_proxy: 'socks5://proxy.test:1080',
    });
  });

  it('withholds credentials and loader hooks whatever the allowlist says', () => {
    for (const name of [
      'FOO_TOKEN',
      'npm_config__authToken',
      'GITHUB_TOKEN',
      'OPENAI_API_KEY',
      'SSH_KEY_PATH',
      'client_secret',
      'DYLD_INSERT_LIBRARIES',
      'LD_PRELOAD',
      'NODE_OPTIONS',
      'node_options',
      'ELECTRON_RUN_AS_NODE',
    ]) {
      expect(isWithheldVariable(name), name).toBe(true);
    }
    for (const name of INHERITED_ENV_ALLOWLIST) {
      expect(isWithheldVariable(name), name).toBe(false);
    }
  });

  it('passes the toolchain locations compilers and version managers read', () => {
    const toolchain = {
      SDKROOT: '/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk',
      DEVELOPER_DIR: '/Library/Developer/CommandLineTools',
      JAVA_HOME: '/opt/java',
      CARGO_HOME: '/Users/someone/.cargo',
      VIRTUAL_ENV: '/work/api/.venv',
      PNPM_HOME: '/Users/someone/Library/pnpm',
    };
    expect(childEnvironment(null, { ...toolchain, CARGO_REGISTRY_TOKEN: 'x' }, 'darwin')).toEqual(
      toolchain,
    );
  });

  it('replaces PATH with the login shell PATH when one was found', () => {
    expect(childEnvironment('/opt/homebrew/bin:/usr/bin', parent, 'darwin')['PATH']).toBe(
      '/opt/homebrew/bin:/usr/bin',
    );
  });

  it('keeps the Windows system variables, matched without regard to case', () => {
    const env = childEnvironment(
      null,
      { Path: 'C:\\Windows', SYSTEMROOT: 'C:\\Windows', NODE_OPTIONS: '--inspect' },
      'win32',
    );
    expect(env).toEqual({ Path: 'C:\\Windows', SYSTEMROOT: 'C:\\Windows' });
  });
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('process tree', () => {
  const parentOfSleeper =
    "node -e \"const c=require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},30000)'],{stdio:'ignore'});console.log(c.pid);setTimeout(()=>{},30000)\"";

  async function startTree() {
    const runId = randomUUID();
    const chunks: ShellStreamChunk[] = [];
    const pending = run(parentOfSleeper, { chunks, runId });
    await vi.waitFor(() => expect(chunks.some((chunk) => /\d/.test(chunk.chunk))).toBe(true));
    const grandchild = Number.parseInt(chunks.map((chunk) => chunk.chunk).join(''), 10);
    expect(isAlive(grandchild)).toBe(true);
    return { runId, pending, grandchild };
  }

  // llm-guardrail-allow: asserts POSIX process-group termination of the run
  it.skipIf(process.platform === 'win32')(
    'cancelling a run also stops the programs it started',
    async () => {
      const { runId, pending, grandchild } = await startTree();
      expect(cancelShellRun(runId)).toBe(true);
      await pending;
      await vi.waitFor(() => expect(isAlive(grandchild)).toBe(false), { timeout: 5_000 });
    },
  );

  // llm-guardrail-allow: asserts a SIGKILL result and POSIX process-group termination
  it.skipIf(process.platform === 'win32')(
    'quitting stops every run together with the programs it started',
    async () => {
      const { pending, grandchild } = await startTree();
      cancelAllShellRuns();
      const result = await pending;
      expect(result.signal).toBe('SIGKILL');
      await vi.waitFor(() => expect(isAlive(grandchild)).toBe(false), { timeout: 5_000 });
    },
  );
});
