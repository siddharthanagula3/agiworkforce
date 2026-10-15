import { EventEmitter } from 'node:events';
import type { SpawnOptions } from 'node:child_process';
import { lstatSync, promises as fs, type Stats } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRoot } from '@agiworkforce/local-runtime-contract';
type ScanModule0 = typeof import('node:child_process');

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));

const { execFile } = vi.hoisted(() => ({
  execFile: (_file: string, _args: string[], _options: unknown, callback: (e: Error) => void) =>
    callback(new Error('no login shell in tests')),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<ScanModule0>();
  return { ...original, spawn, execFile, default: { ...original, spawn, execFile } };
});

const { pinnedRootPath, runShellCommand } = await import('../runtime/shellService');
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
    const writes = args[1]!
      .split('\n')
      .filter((line) => line.startsWith('(allow file-write* (subpath '));
    expect(writes.slice(-2)).toEqual([
      `(allow file-write* (subpath "${folder}"))`,
      `(allow file-write* (subpath "${scratch}"))`,
    ]);
    expect(args[1]).toContain(`(deny file-write-unlink (literal "${folder}"))`);
    expect(args[1]).toContain('[.][hH][uU][sS][kK][yY]');
    expect(args[1]).toContain('(deny file-read* (subpath "');
    expect(args[1]).not.toContain('network');
  });

  it('keeps the network blocked for a prompted run unless the user allowed it', async () => {
    const approve = vi.fn().mockResolvedValue({ approved: true, allowNetwork: false });
    await run({ backend: 'seatbelt', executable: SEATBELT_EXECUTABLE }, approve, {
      allow: [],
      deny: [],
    });

    expect(approve).toHaveBeenCalledTimes(1);
    expect((spawn.mock.calls[0] as [string, string[]])[1][1]).not.toContain('network');
  });

  it('opens the network for the one run the user allowed it for', async () => {
    const approve = vi.fn().mockResolvedValue({ approved: true, allowNetwork: true });
    await run({ backend: 'seatbelt', executable: SEATBELT_EXECUTABLE }, approve, {
      allow: [],
      deny: [],
    });
    expect((spawn.mock.calls[0] as [string, string[]])[1][1]).toContain('(allow network-outbound)');

    spawn.mockClear();
    await run({ backend: 'seatbelt', executable: SEATBELT_EXECUTABLE }, vi.fn());
    expect((spawn.mock.calls[0] as [string, string[]])[1][1]).not.toContain('network');
  });

  it('never opens the network for a run that was refused', async () => {
    const approve = vi.fn().mockResolvedValue({ approved: false, allowNetwork: true });
    await expect(
      run({ backend: 'seatbelt', executable: SEATBELT_EXECUTABLE }, approve, {
        allow: [],
        deny: [],
      }),
    ).rejects.toMatchObject({ name: 'ShellCommandRefused', reason: 'not-listed' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('spawns bubblewrap on Linux with the folder bound writable', async () => {
    await run({ backend: 'bubblewrap', executable: '/usr/bin/bwrap' }, vi.fn());
    const [command, args] = spawn.mock.calls[0] as [string, string[]];
    expect(command).toBe('/usr/bin/bwrap');
    expect(args).toContain('--unshare-net');
    expect(args.join(' ')).toContain(`--bind ${folder} ${folder}`);
  });

  function runAt(folderPath: string) {
    return runShellCommand({
      runId: `at-${Math.random()}`,
      root: { ...root, path: folderPath },
      relativePath: '',
      command: 'node -e "1"',
      policy: { allow: ['node'], deny: [] },
      sandbox: { backend: 'seatbelt', executable: SEATBELT_EXECUTABLE },
      approve: vi.fn(),
      emit: () => undefined,
    });
  }

  it('runs in a folder whose name holds parentheses and a quote, named in the profile as one escaped string', async () => {
    const awkward = path.join(folder, 'Project (copy) "2"');
    await fs.mkdir(awkward);

    await runAt(awkward);

    const profile = (spawn.mock.calls[0] as [string, string[]])[1][1]!;
    expect(profile.split('\n')).toContain(
      `(allow file-write* (subpath "${awkward.replaceAll('"', '\\"')}"))`,
    );
  });

  it('refuses a folder whose path cannot be expressed in the profile, without spawning', async () => {
    const unnameable = path.join(folder, 'Project\ncopy');
    await fs.mkdir(unnameable);

    await expect(runAt(unnameable)).rejects.toMatchObject({
      name: 'ShellCommandRefused',
      reason: 'sandbox-unavailable',
    });
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe('the approved folder is pinned to the path it was approved at', () => {
  const seatbelt = { backend: 'seatbelt', executable: SEATBELT_EXECUTABLE } as const;

  function runIn(at: WorkspaceRoot) {
    return runShellCommand({
      runId: `pinned-${Math.random()}`,
      root: at,
      relativePath: '',
      command: 'node -e "1"',
      policy: { allow: ['node'], deny: [] },
      sandbox: seatbelt,
      approve: vi.fn(),
      emit: () => undefined,
    });
  }

  it('refuses a folder swapped for a link to another home, without spawning', async () => {
    const approved = path.join(folder, 'approved');
    const home = path.join(folder, 'home');
    await fs.mkdir(home);
    await fs.symlink(home, approved);
    try {
      await expect(runIn({ ...root, path: approved })).rejects.toMatchObject({
        name: 'ShellCommandRefused',
        message: expect.stringContaining(`This folder changed since it was approved: ${approved}`),
      });
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      await fs.rm(approved, { force: true });
      await fs.rm(home, { recursive: true, force: true });
    }
  });

  it('refuses a folder whose parent was swapped, so it now resolves elsewhere', async () => {
    const real = path.join(folder, 'real');
    const parent = path.join(folder, 'parent');
    await fs.mkdir(path.join(real, 'project'), { recursive: true });
    await fs.symlink(real, parent);
    try {
      await expect(runIn({ ...root, path: path.join(parent, 'project') })).rejects.toMatchObject({
        message: expect.stringContaining('changed since it was approved'),
      });
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      await fs.rm(parent, { force: true });
      await fs.rm(real, { recursive: true, force: true });
    }
  });

  it('refuses a folder that is gone', async () => {
    await expect(runIn({ ...root, path: path.join(folder, 'missing') })).rejects.toMatchObject({
      message: expect.stringContaining('changed since it was approved'),
    });
  });

  it('refuses the home folder, an ancestor of it and the filesystem root', async () => {
    const home = path.join(folder, 'users', 'someone');
    await fs.mkdir(home, { recursive: true });
    try {
      for (const at of [home, path.join(folder, 'users'), '/']) {
        await expect(pinnedRootPath({ ...root, path: at }, home)).rejects.toMatchObject({
          message: expect.stringContaining('changed since it was approved'),
        });
      }
      const inside = path.join(home, 'project');
      await fs.mkdir(inside);
      await expect(pinnedRootPath({ ...root, path: inside }, home)).resolves.toBe(inside);
    } finally {
      await fs.rm(path.join(folder, 'users'), { recursive: true, force: true });
    }
  });

  it('runs in an unchanged folder, with a fresh private scratch folder', async () => {
    let scratchStat: Stats | null = null;
    spawn.mockImplementationOnce((_command: string, _args: string[], options: SpawnOptions) => {
      scratchStat = lstatSync(options.env!['TMPDIR']!);
      return fakeChild();
    });
    await runIn(root);
    const [, , options] = spawn.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }];
    const scratch = options.env['TMPDIR']!;
    expect(scratchStat!.isDirectory()).toBe(true);
    expect(scratchStat!.mode & 0o777).toBe(0o700);
    expect(path.basename(scratch)).toMatch(/^agi-shell-scratch-/);
    expect(await fs.realpath(path.dirname(scratch))).toBe(path.dirname(scratch));
    const parent = await fs.lstat(path.dirname(scratch));
    expect(parent.uid).toBe(process.getuid!());
    expect(parent.mode & 0o077).toBe(0);
  });
});

describe('runShellCommand without a sandbox', () => {
  it('asks even for an allow-listed program, saying the run is unsandboxed', async () => {
    const approve = vi.fn().mockResolvedValue({ approved: false, allowNetwork: false });
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
    const approve = vi.fn().mockResolvedValue({ approved: true, allowNetwork: false });
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
