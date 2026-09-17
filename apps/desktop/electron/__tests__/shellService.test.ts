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
import { cancelShellRun, runShellCommand, type ShellStreamChunk } from '../runtime/shellService';
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
    network: 'deny',
    approve: vi.fn().mockResolvedValue(options.approve ?? hostSandbox.backend === 'none'),
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
        network: 'deny',
        approve,
        emit: () => undefined,
      }),
    ).rejects.toBeInstanceOf(ShellCommandRefused);
    expect(approve).not.toHaveBeenCalled();
  });

  it('asks before running an unlisted program and honours a refusal', async () => {
    const approve = vi.fn().mockResolvedValue(false);
    await expect(
      runShellCommand({
        runId: randomUUID(),
        root,
        relativePath: '',
        command: 'node -e "1"',
        policy: EMPTY_SHELL_POLICY,
        sandbox: hostSandbox,
        network: 'deny',
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
      network: 'deny',
      approve,
      emit: () => undefined,
    });
    expect(approve).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
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
    expect(cancelShellRun(runId)).toBe(true);
    const result = await pending;
    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toBe(false);
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
