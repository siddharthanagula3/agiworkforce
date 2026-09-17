import { existsSync, promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ShellCommandRefused, type WorkspaceRoot } from '@agiworkforce/local-runtime-contract';
import { runShellCommand } from '../runtime/shellService';
import {
  SEATBELT_DESKTOP_READ_PATHS,
  SEATBELT_EXECUTABLE,
  SEATBELT_NETWORK_RULES,
  SEATBELT_PROCESS_RULES,
  SEATBELT_SHARED_WRITE_PATHS,
  SEATBELT_SYSTEM_READ_PATHS,
  bubblewrapArgs,
  detectShellSandbox,
  planSandboxedSpawn,
  seatbeltProfile,
} from '../runtime/shellSandbox';

const seatbelt = { backend: 'seatbelt', executable: SEATBELT_EXECUTABLE } as const;
const bubblewrap = { backend: 'bubblewrap', executable: '/usr/bin/bwrap' } as const;

const base = {
  program: '/usr/bin/git',
  args: ['status', '--short'],
  cwd: '/work/project/src',
  writableRoots: ['/work/project', '/scratch/agi-shell-scratch-1'],
  readableRoots: ['/opt/toolchain'],
  network: 'deny' as const,
};

function writeRules(profile: string): string[] {
  return profile.split('\n').filter((line) => line.startsWith('(allow file-write*'));
}

describe('seatbelt spawn plan', () => {
  it('runs the resolved program under sandbox-exec with an inline profile', () => {
    const plan = planSandboxedSpawn({ sandbox: seatbelt, ...base });
    expect(plan.command).toBe(SEATBELT_EXECUTABLE);
    expect(plan.args[0]).toBe('-p');
    expect(plan.args.slice(2)).toEqual(['/usr/bin/git', 'status', '--short']);
    expect(plan.args[1]).toContain('(deny default)');
  });

  it('allows writes only inside the approved folder, the scratch folder and shared temp', () => {
    const profile = seatbeltProfile(base);
    expect(writeRules(profile)).toEqual([
      '(allow file-write* (literal "/dev/null"))',
      '(allow file-write* (subpath "/tmp") (subpath "/private/tmp"))',
      '(allow file-write* (subpath "/work/project") (subpath "/scratch/agi-shell-scratch-1"))',
    ]);
    expect(profile).not.toContain('(allow default)');
    expect(profile).not.toContain(os.homedir());
  });

  it('never makes a toolchain folder writable', () => {
    const profile = seatbeltProfile(base);
    expect(writeRules(profile).some((line) => line.includes('/opt/toolchain'))).toBe(false);
    expect(profile).toContain('(subpath "/opt/toolchain")');
  });

  it('denies the network unless the run allows it', () => {
    expect(seatbeltProfile(base)).not.toContain('network');
    const open = seatbeltProfile({ ...base, network: 'allow' });
    for (const rule of SEATBELT_NETWORK_RULES) expect(open).toContain(rule);
  });

  it('refuses a folder path that could rewrite the profile', () => {
    const attempt = () =>
      seatbeltProfile({ ...base, writableRoots: ['/tmp/x")(allow default)(deny "'] });
    expect(attempt).toThrow(ShellCommandRefused);
    try {
      attempt();
    } catch (error) {
      expect((error as ShellCommandRefused).reason).toBe('sandbox-unavailable');
    }
  });

  it('refuses a plan with no folder to confine writes to', () => {
    expect(() => planSandboxedSpawn({ sandbox: seatbelt, ...base, writableRoots: [] })).toThrow(
      ShellCommandRefused,
    );
  });
});

describe('bubblewrap spawn plan', () => {
  it('mounts the system read-only, binds only the writable roots and runs the program directly', () => {
    const plan = planSandboxedSpawn({ sandbox: bubblewrap, ...base });
    expect(plan.command).toBe('/usr/bin/bwrap');
    expect(plan.args).toEqual([
      '--die-with-parent',
      '--unshare-pid',
      '--unshare-uts',
      '--unshare-net',
      '--ro-bind',
      '/',
      '/',
      '--tmpfs',
      '/tmp',
      '--dev',
      '/dev',
      '--proc',
      '/proc',
      '--bind',
      '/work/project',
      '/work/project',
      '--bind',
      '/scratch/agi-shell-scratch-1',
      '/scratch/agi-shell-scratch-1',
      '--chdir',
      '/work/project/src',
      '--',
      '/usr/bin/git',
      'status',
      '--short',
    ]);
  });

  it('keeps the network namespace only when the run allows the network', () => {
    expect(bubblewrapArgs({ ...base, network: 'allow' })).not.toContain('--unshare-net');
  });

  it('refuses the filesystem root as a writable root', () => {
    expect(() => bubblewrapArgs({ ...base, writableRoots: ['/'] })).toThrow(ShellCommandRefused);
  });
});

describe('sandbox detection', () => {
  let bin: string;

  beforeAll(async () => {
    bin = await fs.mkdtemp(path.join(os.tmpdir(), 'agi-bwrap-'));
    await fs.writeFile(path.join(bin, 'bwrap'), '#!/bin/sh\n', { mode: 0o755 });
  });

  afterAll(async () => {
    await fs.rm(bin, { recursive: true, force: true });
  });

  it('has no sandbox on Windows', async () => {
    expect(await detectShellSandbox('win32', bin)).toEqual({ backend: 'none' });
  });

  it('uses bubblewrap on Linux when it is on PATH', async () => {
    expect(await detectShellSandbox('linux', bin)).toEqual({
      backend: 'bubblewrap',
      executable: path.join(bin, 'bwrap'),
    });
  });

  it('has no sandbox on Linux without bubblewrap', async () => {
    expect(await detectShellSandbox('linux', '')).toEqual({ backend: 'none' });
  });

  it('uses seatbelt on macOS when sandbox-exec exists', async () => {
    expect(await detectShellSandbox('darwin', '')).toEqual(
      existsSync(SEATBELT_EXECUTABLE) ? seatbelt : { backend: 'none' },
    );
  });
});

describe('parity with the CLI seatbelt profile', () => {
  const cliSource = readFileSync(path.resolve(__dirname, '../../../cli/src/sandbox.rs'), 'utf8');
  const start = cliSource.indexOf('fn seatbelt_profile(');
  const end = cliSource.indexOf('fn bubblewrap_args(');
  const cliProfile = cliSource.slice(start, end);

  it('reads the CLI profile builder', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it('grants the same process rules', () => {
    const cliRules = cliProfile
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^\(allow (process|signal|sysctl|mach|system-socket)/.test(line));
    expect(cliRules).toEqual([...SEATBELT_PROCESS_RULES]);
  });

  it('opens the network with the same rules', () => {
    for (const rule of SEATBELT_NETWORK_RULES) expect(cliProfile).toContain(rule);
  });

  it('reads and writes the same fixed system paths, plus only the declared desktop additions', () => {
    const cliPaths = new Set(
      [...cliProfile.matchAll(/\(subpath \\?"(\/[^"{\\]*)\\?"\)/g)].map((match) => match[1]),
    );
    expect(cliPaths).toEqual(
      new Set([...SEATBELT_SYSTEM_READ_PATHS, ...SEATBELT_SHARED_WRITE_PATHS]),
    );
    for (const extra of SEATBELT_DESKTOP_READ_PATHS) expect(cliPaths.has(extra)).toBe(false);
  });
});

describe.runIf(process.platform === 'darwin' && existsSync(SEATBELT_EXECUTABLE))(
  'a real sandbox-exec run',
  () => {
    let folder: string;
    let root: WorkspaceRoot;
    const outside = path.join(os.homedir(), `agi-sandbox-escape-${randomUUID()}.txt`);

    beforeAll(async () => {
      folder = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-sandboxed-')));
      root = { id: 'r', path: folder, name: 'sandboxed', grantedAtMs: 0, lastOpenedAtMs: 0 };
    });

    afterAll(async () => {
      await fs.rm(folder, { recursive: true, force: true });
      await fs.rm(outside, { force: true });
    });

    function run(script: string) {
      return runShellCommand({
        runId: randomUUID(),
        root,
        relativePath: '',
        command: `node -e "${script}"`,
        policy: { allow: ['node'], deny: [] },
        sandbox: seatbelt,
        network: 'deny',
        approve: vi.fn().mockResolvedValue(false),
        emit: () => undefined,
      });
    }

    it('writes inside the approved folder and its private temp folder', async () => {
      const result = await run(
        "const fs=require('fs'),os=require('os');fs.writeFileSync('inside.txt','ok');fs.writeFileSync(os.tmpdir()+'/t','ok');console.log('done')",
      );
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(await fs.readFile(path.join(folder, 'inside.txt'), 'utf8')).toBe('ok');
    });

    it('is refused a write outside the approved folder', async () => {
      const result = await run(`require('fs').writeFileSync('${outside}','escaped')`);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('EPERM');
      expect(existsSync(outside)).toBe(false);
    });

    it('is refused a read of the home folder', async () => {
      const result = await run(`require('fs').readdirSync(require('os').homedir())`);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('EPERM');
    });
  },
);
