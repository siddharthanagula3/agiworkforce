import { describe, expect, it, vi } from 'vitest';
import {
  reconcileDeveloperAccount,
  type DeveloperAccountBridge,
  type ShellIdentity,
} from '../runtime/developerAccountSync';

const LOGIN = {
  loginId: 'login-1',
  verificationUrl: 'https://host/auth/device',
  userCode: 'QRST-9876',
};

function hostCalls(responses: Record<string, unknown>) {
  const seen: Array<{ method: string; params: Record<string, unknown> }> = [];
  const call = vi.fn(async (method: string, params: Record<string, unknown>) => {
    seen.push({ method, params });
    if (!(method in responses)) throw new Error(`unexpected app-server call ${method}`);
    return responses[method];
  });
  return { call, seen, methods: () => seen.map((entry) => entry.method) };
}

function bridge(identity: ShellIdentity | null): DeveloperAccountBridge & {
  approveDeviceCode: ReturnType<typeof vi.fn>;
} {
  return {
    readShellIdentity: vi.fn(async () => identity),
    approveDeviceCode: vi.fn(async () => undefined),
  };
}

const SIGNED_OUT_HOST = { signedIn: false };
const COMPLETED = {
  outcome: 'completed',
  account: { signedIn: true, email: 'qa@agiworkforce.com' },
};

describe('reconcileDeveloperAccount', () => {
  it('signs a signed-out app-server in as the shell account and refreshes the models', async () => {
    const host = hostCalls({
      'account/status': SIGNED_OUT_HOST,
      'account/login': LOGIN,
      'account/login/wait': COMPLETED,
      'model/list': { models: [] },
    });
    const shell = bridge({ signedIn: true, email: 'qa@agiworkforce.com' });

    await expect(reconcileDeveloperAccount(host.call, shell)).resolves.toBe('signed-in');

    expect(host.methods()).toEqual([
      'account/status',
      'account/login',
      'account/login/wait',
      'model/list',
    ]);
    expect(shell.approveDeviceCode).toHaveBeenCalledExactlyOnceWith(LOGIN.userCode);
    expect(host.seen[2]?.params).toEqual({ loginId: LOGIN.loginId });
    expect(host.seen[3]?.params).toEqual({ refresh: true });
  });

  it('approves only the code that account/login returned', async () => {
    const host = hostCalls({
      'account/status': SIGNED_OUT_HOST,
      'account/login': { ...LOGIN, userCode: 'ABCD-1234' },
      'account/login/wait': COMPLETED,
      'model/list': { models: [] },
    });
    const shell = bridge({ signedIn: true, email: 'qa@agiworkforce.com' });

    await reconcileDeveloperAccount(host.call, shell);

    expect(shell.approveDeviceCode).toHaveBeenCalledExactlyOnceWith('ABCD-1234');
  });

  it('refuses to approve anything when the login returns no usable code', async () => {
    const host = hostCalls({
      'account/status': SIGNED_OUT_HOST,
      'account/login': { loginId: 'login-1', verificationUrl: 'https://host/auth/device' },
    });
    const shell = bridge({ signedIn: true, email: 'qa@agiworkforce.com' });

    await expect(reconcileDeveloperAccount(host.call, shell)).rejects.toThrow(
      /no device sign-in this app could approve/i,
    );
    expect(shell.approveDeviceCode).not.toHaveBeenCalled();
  });

  it('leaves a matching account alone', async () => {
    const host = hostCalls({
      'account/status': { signedIn: true, email: 'QA@AgiWorkforce.com' },
    });
    const shell = bridge({ signedIn: true, email: 'qa@agiworkforce.com' });

    await expect(reconcileDeveloperAccount(host.call, shell)).resolves.toBe('unchanged');

    expect(host.methods()).toEqual(['account/status']);
    expect(shell.approveDeviceCode).not.toHaveBeenCalled();
  });

  it('signs a mismatched account out and back in as the shell account', async () => {
    const host = hostCalls({
      'account/status': { signedIn: true, email: 'someone-else@agiworkforce.com' },
      'account/logout': null,
      'account/login': LOGIN,
      'account/login/wait': COMPLETED,
      'model/list': { models: [] },
    });
    const shell = bridge({ signedIn: true, email: 'qa@agiworkforce.com' });

    await expect(reconcileDeveloperAccount(host.call, shell)).resolves.toBe('signed-in');

    expect(host.methods()).toEqual([
      'account/status',
      'account/logout',
      'account/login',
      'account/login/wait',
      'model/list',
    ]);
  });

  it('signs the app-server out when the shell signed out', async () => {
    const host = hostCalls({
      'account/status': { signedIn: true, email: 'qa@agiworkforce.com' },
      'account/logout': null,
      'model/list': { models: [] },
    });
    const shell = bridge({ signedIn: false, email: null });

    await expect(reconcileDeveloperAccount(host.call, shell)).resolves.toBe('signed-out');

    expect(host.methods()).toEqual(['account/status', 'account/logout', 'model/list']);
    expect(host.seen[2]?.params).toEqual({ refresh: true });
  });

  it('does nothing when both sides are already signed out', async () => {
    const host = hostCalls({ 'account/status': SIGNED_OUT_HOST });
    const shell = bridge({ signedIn: false, email: null });

    await expect(reconcileDeveloperAccount(host.call, shell)).resolves.toBe('unchanged');

    expect(host.methods()).toEqual(['account/status']);
  });

  it('touches nothing when the shell account cannot be read', async () => {
    const host = hostCalls({});
    const shell = bridge(null);

    await expect(reconcileDeveloperAccount(host.call, shell)).resolves.toBe('unknown');

    expect(host.call).not.toHaveBeenCalled();
    expect(shell.approveDeviceCode).not.toHaveBeenCalled();
  });

  it('reports the wait outcome when the grant never completes', async () => {
    const host = hostCalls({
      'account/status': SIGNED_OUT_HOST,
      'account/login': LOGIN,
      'account/login/wait': {
        outcome: 'expired',
        message: 'The device code expired before it was approved',
        account: { signedIn: false },
      },
    });
    const shell = bridge({ signedIn: true, email: 'qa@agiworkforce.com' });

    await expect(reconcileDeveloperAccount(host.call, shell)).rejects.toThrow(
      'The device code expired before it was approved',
    );
    expect(host.methods()).not.toContain('model/list');
  });

  it('stops at a refused approval without waiting on the grant', async () => {
    const host = hostCalls({ 'account/status': SIGNED_OUT_HOST, 'account/login': LOGIN });
    const shell = bridge({ signedIn: true, email: 'qa@agiworkforce.com' });
    shell.approveDeviceCode.mockRejectedValueOnce(new Error('Device sign-in is turned off'));

    await expect(reconcileDeveloperAccount(host.call, shell)).rejects.toThrow(
      'Device sign-in is turned off',
    );
    expect(host.methods()).toEqual(['account/status', 'account/login']);
  });
});
