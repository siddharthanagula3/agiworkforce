import { describe, expect, it, vi } from 'vitest';
import {
  cliProbeMessage,
  describeRemoteEnvironment,
  probeCli,
  probeResolvedCli,
  resolveCliPath,
  type CliResolutionHost,
} from '../platform/remoteEnvironment';
import { PRODUCT_NAMES } from '@agiworkforce/types';

function host(
  executables: string[],
  overrides: Partial<CliResolutionHost> = {},
): CliResolutionHost {
  return {
    platform: 'linux',
    homedir: '/home/dev',
    pathVariable: '/usr/bin:/bin',
    isExecutableFile: (candidate) => executables.includes(candidate),
    workspaceRoots: [],
    ...overrides,
  };
}

describe('remote environments', () => {
  it('names WSL, SSH and container windows from vscode.env.remoteName', () => {
    expect(describeRemoteEnvironment(undefined).kind).toBe('local');
    expect(describeRemoteEnvironment('wsl')).toMatchObject({ kind: 'wsl', label: 'WSL' });
    expect(describeRemoteEnvironment('ssh-remote')).toMatchObject({
      kind: 'ssh',
      label: 'the SSH host',
    });
    expect(describeRemoteEnvironment('dev-container').kind).toBe('dev-container');
    expect(describeRemoteEnvironment('attached-container').kind).toBe('dev-container');
    expect(describeRemoteEnvironment('k8s-container')).toMatchObject({
      kind: 'other-remote',
      remoteName: 'k8s-container',
    });
  });
});

describe('resolving the CLI inside the environment', () => {
  const found = (path: string) => ({ ok: true, path });

  it('finds the CLI on the PATH the remote server started with', () => {
    expect(resolveCliPath('agi', host(['/usr/bin/agi']))).toEqual(found('/usr/bin/agi'));
  });

  it('finds an installer-placed CLI the remote server PATH leaves out', () => {
    expect(resolveCliPath('agi', host(['/home/dev/.agi/bin/agi']))).toEqual(
      found('/home/dev/.agi/bin/agi'),
    );
    expect(resolveCliPath('agi', host(['/home/dev/.cargo/bin/agi']))).toEqual(
      found('/home/dev/.cargo/bin/agi'),
    );
  });

  it('keeps an explicit path, expanding the home directory of the remote user', () => {
    expect(resolveCliPath('~/tools/agi', host([]))).toEqual(found('/home/dev/tools/agi'));
    expect(resolveCliPath('/opt/agi/bin/agi', host([]))).toEqual(found('/opt/agi/bin/agi'));
  });

  it('never hands a bare name back to be spawned when nothing matches', () => {
    expect(resolveCliPath('agi', host([]))).toEqual({
      ok: false,
      configured: 'agi',
      reason: 'not-found',
    });
    expect(resolveCliPath('  ', host([]))).toEqual({ ok: false, configured: '', reason: 'empty' });
  });

  it('refuses a relative path, which would resolve against the workspace', () => {
    expect(resolveCliPath('./bin/agi', host(['./bin/agi']))).toEqual({
      ok: false,
      configured: './bin/agi',
      reason: 'relative',
    });
  });

  it('skips relative PATH entries and PATH entries inside an open workspace folder', () => {
    const planted = host(['bin/agi', '/repo/tools/agi', '/usr/local/bin/agi'], {
      pathVariable: 'bin:/repo/tools:/usr/local/bin',
      workspaceRoots: ['/repo'],
    });
    expect(resolveCliPath('agi', planted)).toEqual(found('/usr/local/bin/agi'));
  });

  it('does not let a planted agi.exe in the workspace stand in on Windows', () => {
    const windows = host(['C:\\repo\\agi.exe'], {
      platform: 'win32',
      homedir: 'C:\\Users\\dev',
      pathVariable: '.;C:\\repo;C:\\Windows',
      workspaceRoots: ['c:\\Repo'],
    });
    expect(resolveCliPath('agi', windows)).toEqual({
      ok: false,
      configured: 'agi',
      reason: 'not-found',
    });
  });

  it('tries the Windows executable suffixes', () => {
    const windows = host(['C:\\Tools\\agi.exe'], {
      platform: 'win32',
      homedir: 'C:\\Users\\dev',
      pathVariable: 'C:\\Tools;C:\\Windows',
    });
    expect(resolveCliPath('agi', windows)).toEqual(found('C:\\Tools\\agi.exe'));
  });
});

describe('testing the CLI in the environment', () => {
  it('reports the version and where it ran', async () => {
    const result = await probeCli('/usr/bin/agi', async () => 'agi 1.4.0');
    expect(result).toEqual({ ok: true, cliPath: '/usr/bin/agi', version: 'agi 1.4.0' });
    expect(cliProbeMessage(result, describeRemoteEnvironment('wsl'))).toBe(
      `${PRODUCT_NAMES.code}: agi 1.4.0 runs from /usr/bin/agi in WSL.`,
    );
  });

  it('reports an unresolved CLI without running anything', async () => {
    const runVersion = vi.fn(async () => 'agi 1.4.0');
    const result = await probeResolvedCli(
      { ok: false, configured: 'agi', reason: 'not-found' },
      runVersion,
    );
    expect(runVersion).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      cliPath: 'agi',
      reason: 'was not found on the PATH or in the usual install folders',
    });
  });

  it('says the CLI is missing inside the remote and how to fix it', async () => {
    const missing = Object.assign(new Error('spawn agi ENOENT'), { code: 'ENOENT' });
    const result = await probeCli('agi', async () => {
      throw missing;
    });
    expect(result).toEqual({ ok: false, cliPath: 'agi', reason: 'was not found' });
    expect(cliProbeMessage(result, describeRemoteEnvironment('dev-container'))).toContain(
      'was not found in the dev container. Install the CLI there',
    );
  });
});
