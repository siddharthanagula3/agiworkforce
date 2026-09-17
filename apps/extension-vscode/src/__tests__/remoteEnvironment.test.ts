import { describe, expect, it } from 'vitest';
import {
  cliProbeMessage,
  describeRemoteEnvironment,
  probeCli,
  resolveCliPath,
  type CliResolutionHost,
} from '../platform/remoteEnvironment';

function host(
  executables: string[],
  overrides: Partial<CliResolutionHost> = {},
): CliResolutionHost {
  return {
    platform: 'linux',
    homedir: '/home/dev',
    pathVariable: '/usr/bin:/bin',
    isExecutableFile: (candidate) => executables.includes(candidate),
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
  it('finds the CLI on the PATH the remote server started with', () => {
    expect(resolveCliPath('agi', host(['/usr/bin/agi']))).toBe('/usr/bin/agi');
  });

  it('finds an installer-placed CLI the remote server PATH leaves out', () => {
    expect(resolveCliPath('agi', host(['/home/dev/.agi/bin/agi']))).toBe('/home/dev/.agi/bin/agi');
    expect(resolveCliPath('agi', host(['/home/dev/.cargo/bin/agi']))).toBe(
      '/home/dev/.cargo/bin/agi',
    );
  });

  it('keeps an explicit path, expanding the home directory of the remote user', () => {
    expect(resolveCliPath('~/tools/agi', host([]))).toBe('/home/dev/tools/agi');
    expect(resolveCliPath('/opt/agi/bin/agi', host([]))).toBe('/opt/agi/bin/agi');
  });

  it('returns the configured name unchanged when nothing matches, so the failure names it', () => {
    expect(resolveCliPath('agi', host([]))).toBe('agi');
  });

  it('tries the Windows executable suffixes', () => {
    const windows = host(['C:\\Tools\\agi.exe'], {
      platform: 'win32',
      homedir: 'C:\\Users\\dev',
      pathVariable: 'C:\\Tools;C:\\Windows',
    });
    expect(resolveCliPath('agi', windows)).toBe('C:\\Tools\\agi.exe');
  });
});

describe('testing the CLI in the environment', () => {
  it('reports the version and where it ran', async () => {
    const result = await probeCli('/usr/bin/agi', async () => 'agi 1.4.0');
    expect(result).toEqual({ ok: true, cliPath: '/usr/bin/agi', version: 'agi 1.4.0' });
    expect(cliProbeMessage(result, describeRemoteEnvironment('wsl'))).toBe(
      'AGI Workforce: agi 1.4.0 runs from /usr/bin/agi in WSL.',
    );
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
