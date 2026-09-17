import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRoot } from '@agiworkforce/local-runtime-contract';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));

const { execFile } = vi.hoisted(() => ({
  execFile: (_file: string, _args: string[], _options: unknown, callback: (e: Error) => void) =>
    callback(new Error('no login shell in tests')),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, spawn, execFile, default: { ...original, spawn, execFile } };
});

const { runShellCommand } = await import('../runtime/shellService');
const { SEATBELT_EXECUTABLE } = await import('../runtime/shellSandbox');

function fakeChild() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
  });
  setImmediate(() => child.emit('close', 0, null));
  return child;
}

let folder: string;
let root: WorkspaceRoot;

beforeAll(async () => {
  folder = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-shell-mocked-')));
  root = { id: 'r', path: folder, name: 'mocked', grantedAtMs: 0, lastOpenedAtMs: 0 };
});

afterAll(async () => {
  await fs.rm(folder, { recursive: true, force: true });
});

beforeEach(() => {
  spawn.mockReset();
  spawn.mockImplementation(fakeChild);
});

function run(
  sandbox: Parameters<typeof runShellCommand>[0]['sandbox'],
  approve: Parameters<typeof runShellCommand>[0]['approve'],
  policy = { allow: ['node'], deny: [] as string[] },
) {
  return runShellCommand({
    runId: `run-${Math.random()}`,
    root,
    relativePath: '',
    command: 'node -e "1"',
    policy,
    sandbox,
    network: 'deny',
    approve,
    emit: () => undefined,
  });
}

describe('runShellCommand with a sandbox', () => {
  it('spawns sandbox-exec around the resolved program, confined to the folder', async () => {
    const approve = vi.fn();
    await run({ backend: 'seatbelt', executable: SEATBELT_EXECUTABLE }, approve);

    expect(approve).not.toHaveBeenCalled();
    const [command, args, options] = spawn.mock.calls[0] as [
      string,
      string[],
      { cwd: string; env: NodeJS.ProcessEnv },
    ];
    expect(command).toBe(SEATBELT_EXECUTABLE);
    expect(args[0]).toBe('-p');
    expect(path.isAbsolute(args[2]!)).toBe(true);
    expect(path.basename(args[2]!)).toBe('node');
    expect(args.slice(3)).toEqual(['-e', '1']);
    expect(options.cwd).toBe(folder);

    const scratch = options.env['TMPDIR']!;
    const writes = args[1]!.split('\n').filter((line) => line.startsWith('(allow file-write*'));
    expect(writes.at(-1)).toBe(`(allow file-write* (subpath "${folder}") (subpath "${scratch}"))`);
    expect(args[1]).not.toContain('network');
  });

  it('spawns bubblewrap on Linux with the folder bound writable', async () => {
    await run({ backend: 'bubblewrap', executable: '/usr/bin/bwrap' }, vi.fn());
    const [command, args] = spawn.mock.calls[0] as [string, string[]];
    expect(command).toBe('/usr/bin/bwrap');
    expect(args).toContain('--unshare-net');
    expect(args.join(' ')).toContain(`--bind ${folder} ${folder}`);
  });

  it('refuses a folder whose path cannot be expressed in the profile, without spawning', async () => {
    const awkward = path.join(folder, 'Project (copy)');
    await fs.mkdir(awkward);
    await expect(
      runShellCommand({
        runId: 'awkward',
        root: { ...root, path: awkward },
        relativePath: '',
        command: 'node -e "1"',
        policy: { allow: ['node'], deny: [] },
        sandbox: { backend: 'seatbelt', executable: SEATBELT_EXECUTABLE },
        network: 'deny',
        approve: vi.fn(),
        emit: () => undefined,
      }),
    ).rejects.toMatchObject({ name: 'ShellCommandRefused', reason: 'sandbox-unavailable' });
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe('runShellCommand without a sandbox', () => {
  it('asks even for an allow-listed program, saying the run is unsandboxed', async () => {
    const approve = vi.fn().mockResolvedValue(false);
    await expect(run({ backend: 'none' }, approve)).rejects.toMatchObject({
      name: 'ShellCommandRefused',
      reason: 'sandbox-unavailable',
    });
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve.mock.calls[0]![0]).toMatchObject({ sandboxed: false, command: 'node -e "1"' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('refuses without spawning when the approval is never given', async () => {
    const approve = vi.fn().mockRejectedValue(new Error('dialog closed'));
    await expect(run({ backend: 'none' }, approve)).rejects.toThrow('dialog closed');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('runs the program directly only after the unsandboxed run is approved', async () => {
    const approve = vi.fn().mockResolvedValue(true);
    await run({ backend: 'none' }, approve, { allow: [], deny: [] });
    expect(approve).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawn.mock.calls[0] as [
      string,
      string[],
      { env: NodeJS.ProcessEnv },
    ];
    expect(command).toBe('node');
    expect(args).toEqual(['-e', '1']);
    expect(options.env['TMPDIR']).toBe(process.env['TMPDIR']);
  });

  it('still refuses a denied program without offering the override', async () => {
    const approve = vi.fn();
    await expect(
      run({ backend: 'none' }, approve, { allow: [], deny: ['node'] }),
    ).rejects.toMatchObject({ reason: 'denied-by-policy' });
    expect(approve).not.toHaveBeenCalled();
  });
});
