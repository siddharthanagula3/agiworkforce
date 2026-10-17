import { beforeEach, describe, expect, it, vi } from 'vitest';
const probe = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => {
  const execFile = Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: probe });
  return { execFile, default: { execFile } };
});
const config = (extra = '') =>
  `hostname owned.example.invalid\nuser fixture\nport 22\nproxyjump none\nproxycommand none\nremotecommand none\n${extra}`;
beforeEach(() => {
  vi.resetModules();
  probe.mockReset();
  probe.mockResolvedValue({ stdout: config(), stderr: '' });
});
const input = { name: 'Owned host', hostAlias: 'owned-alias', remotePath: '/srv/owned-project' };

describe('SSH environment adapter', () => {
  it('uses strict host verification, no agent forwarding, no PTY and safely quoted remote paths', async () => {
    const adapter = await import('../runtime/sshEnvironments');
    const root = await adapter.admitSshEnvironment({
      ...input,
      remotePath: "/srv/owned '$() project",
    });
    const launch = await adapter.sshLaunch(root.id);
    expect(launch.program).toBe('/usr/bin/ssh');
    expect(launch.args).toEqual(
      expect.arrayContaining([
        '-F',
        '/dev/null',
        '-oStrictHostKeyChecking=yes',
        '-oBatchMode=yes',
        '-oForwardAgent=no',
        '-oClearAllForwardings=yes',
        '-T',
      ]),
    );
    expect(launch.args.at(-1)).toBe(`cd -- '/srv/owned '"'"'$() project' && exec agi app-server`);
    expect(adapter.listSshEnvironments()[0]).toMatchObject({
      authorized: true,
      capabilities: { hostFileEditor: false, pty: false, jumpHosts: false },
    });
  });

  it.each(['-oProxyCommand=bad', 'host;command', 'user@host', 'host\ncommand'])(
    'rejects host syntax before invoking SSH: %s',
    async (hostAlias) => {
      const adapter = await import('../runtime/sshEnvironments');
      await expect(adapter.admitSshEnvironment({ ...input, hostAlias })).rejects.toThrow(
        /alias or hostname/,
      );
      expect(probe).not.toHaveBeenCalled();
    },
  );

  it.each(['/', '////', 'relative', '/srv/../etc'])(
    'rejects unsupported remote root: %s',
    async (remotePath) => {
      const adapter = await import('../runtime/sshEnvironments');
      await expect(adapter.admitSshEnvironment({ ...input, remotePath })).rejects.toThrow(
        /absolute Unix project/,
      );
      expect(probe).not.toHaveBeenCalled();
    },
  );

  it('keeps app credentials and model/provider secrets out of the SSH process environment', async () => {
    const adapter = await import('../runtime/sshEnvironments');
    const previous = process.env['AGI_SSH_FIXTURE_SECRET'];
    process.env['AGI_SSH_FIXTURE_SECRET'] = 'owned-not-a-real-secret';
    try {
      expect(adapter.sshEnvironmentProcessEnv()).not.toHaveProperty('AGI_SSH_FIXTURE_SECRET');
      expect(adapter.sshEnvironmentProcessEnv()).not.toHaveProperty('OPENAI_API_KEY');
    } finally {
      if (previous === undefined) delete process.env['AGI_SSH_FIXTURE_SECRET'];
      else process.env['AGI_SSH_FIXTURE_SECRET'] = previous;
    }
  });

  it('refuses proxy/jump configuration instead of silently connecting directly', async () => {
    const adapter = await import('../runtime/sshEnvironments');
    probe.mockResolvedValueOnce({
      stdout: config().replace('proxyjump none', 'proxyjump bastion'),
      stderr: '',
    });
    await expect(adapter.admitSshEnvironment(input)).rejects.toThrow(/No direct fallback/);
    expect(adapter.listSshEnvironments()).toEqual([]);
  });

  it('binds workspace identity across reconnect and refuses replacement or path aliasing', async () => {
    const adapter = await import('../runtime/sshEnvironments');
    const root = await adapter.admitSshEnvironment(input);
    adapter.verifySshWorkspace(root.id, { cwd: input.remotePath, rootKey: 'dev:ino' });
    adapter.verifySshWorkspace(root.id, { cwd: input.remotePath, rootKey: 'dev:ino' });
    expect(() =>
      adapter.verifySshWorkspace(root.id, { cwd: '/another', rootKey: 'dev:ino' }),
    ).toThrow(/resolves elsewhere/);
    expect(() =>
      adapter.verifySshWorkspace(root.id, { cwd: input.remotePath, rootKey: 'dev:replacement' }),
    ).toThrow(/changed identity/);
  });

  it('refuses a changed SSH profile and never reuses its old root identity for another host', async () => {
    const adapter = await import('../runtime/sshEnvironments');
    const root = await adapter.admitSshEnvironment(input);
    probe.mockResolvedValue({
      stdout: config().replace('owned.example.invalid', 'different.example.invalid'),
      stderr: '',
    });
    await expect(adapter.sshLaunch(root.id)).rejects.toThrow(/profile changed/);
    expect((await adapter.admitSshEnvironment(input)).id).not.toBe(root.id);
  });

  it('does not launch a connection whose grant was withdrawn during inspection', async () => {
    const adapter = await import('../runtime/sshEnvironments');
    const root = await adapter.admitSshEnvironment(input);
    let finish!: (value: { stdout: string; stderr: string }) => void;
    probe.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const launch = adapter.sshLaunch(root.id);
    adapter.forgetSshEnvironment(root.id);
    finish({ stdout: config(), stderr: '' });
    await expect(launch).rejects.toThrow(/cancelled or replaced/);
  });
});

it('preserves configured identity and known-host files in the locked launch', async () => {
  probe.mockResolvedValue({
    stdout: config(
      'identityfile /owned/key-one\nidentityfile /owned/key-two\nuserknownhostsfile /owned/known_hosts\n',
    ),
    stderr: '',
  });
  const adapter = await import('../runtime/sshEnvironments');
  const root = await adapter.admitSshEnvironment(input);
  const launch = await adapter.sshLaunch(root.id);
  expect(launch.args).toEqual(
    expect.arrayContaining([
      '-i',
      '/owned/key-one',
      '/owned/key-two',
      '-oUserKnownHostsFile=/owned/known_hosts',
      '-oStrictHostKeyChecking=yes',
    ]),
  );
});

it('keeps explicit SSH identity and agent refusals instead of enabling default credentials', async () => {
  probe.mockResolvedValue({
    stdout: config('identityfile none\nidentitiesonly yes\nidentityagent none\n'),
    stderr: '',
  });
  const adapter = await import('../runtime/sshEnvironments');
  const root = await adapter.admitSshEnvironment(input);
  const launch = await adapter.sshLaunch(root.id);
  expect(launch.args).toEqual(
    expect.arrayContaining(['-oIdentityFile=none', '-oIdentitiesOnly=yes', '-oIdentityAgent=none']),
  );
  expect(launch.args).not.toContain('-i');
});
