import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let userData = '';

vi.mock('electron', () => ({
  app: { getPath: () => userData },
  dialog: { showMessageBox: vi.fn() },
}));

beforeAll(async () => {
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'agi-permissions-'));
});

afterAll(async () => {
  await fs.rm(userData, { recursive: true, force: true });
});

async function freshRuntime() {
  vi.resetModules();
  return import('../runtime/permissionManager');
}

const DEVICE = 'device-7f3a';
const OTHER_DEVICE = 'device-91bc';
const GLOBAL = { kind: 'global' } as const;

beforeEach(async () => {
  await fs.rm(path.join(userData, 'revoked-devices.json'), { force: true });
  await fs.rm(path.join(userData, 'desktop-permissions.json'), { force: true });
});

describe('a revoked device is refused on its next command', () => {
  it('rejects the command issued immediately after the revocation', async () => {
    const runtime = await freshRuntime();
    runtime.recordDecision('computer.use', GLOBAL, 'granted', 'always', true);
    expect(runtime.authorizeRemoteCommand(DEVICE, 'computer.use', GLOBAL).allowed).toBe(true);

    runtime.revokeDevice(DEVICE);

    const refusal = runtime.authorizeRemoteCommand(DEVICE, 'computer.use', GLOBAL);
    expect(refusal.allowed).toBe(false);
    expect(refusal.reason).toContain('revoked');
  });

  it('refuses every capability, not only the one the grant covered', async () => {
    const runtime = await freshRuntime();
    runtime.recordDecision('filesystem.read', GLOBAL, 'granted', 'always');
    runtime.recordDecision('shell.execute', GLOBAL, 'granted', 'always', true);
    runtime.revokeDevice(DEVICE);

    for (const capability of ['filesystem.read', 'shell.execute'] as const) {
      expect(runtime.authorizeRemoteCommand(DEVICE, capability, GLOBAL).allowed).toBe(false);
    }
  });

  it('leaves every other device working', async () => {
    const runtime = await freshRuntime();
    runtime.recordDecision('computer.use', GLOBAL, 'granted', 'always', true);
    runtime.revokeDevice(DEVICE);

    expect(runtime.authorizeRemoteCommand(OTHER_DEVICE, 'computer.use', GLOBAL).allowed).toBe(true);
    expect(runtime.isDeviceRevoked(OTHER_DEVICE)).toBe(false);
  });

  it('survives a restart of the runtime', async () => {
    const first = await freshRuntime();
    first.recordDecision('computer.use', GLOBAL, 'granted', 'always', true);
    first.revokeDevice(DEVICE);

    const restarted = await freshRuntime();
    expect(restarted.isDeviceRevoked(DEVICE)).toBe(true);
    expect(restarted.authorizeRemoteCommand(DEVICE, 'computer.use', GLOBAL).allowed).toBe(false);
  });

  it('refuses a command that does not say which device sent it', async () => {
    const runtime = await freshRuntime();
    runtime.recordDecision('computer.use', GLOBAL, 'granted', 'always', true);

    const refusal = runtime.authorizeRemoteCommand(null, 'computer.use', GLOBAL);
    expect(refusal.allowed).toBe(false);
    expect(refusal.reason).toContain('which device');
  });

  it('refuses without prompting when the capability was never granted', async () => {
    const runtime = await freshRuntime();
    const refusal = runtime.authorizeRemoteCommand(DEVICE, 'computer.use', GLOBAL);
    expect(refusal.allowed).toBe(false);
    expect(refusal.reason).toContain('has not been allowed');
  });

  it('lets a device back in once it is paired again', async () => {
    const runtime = await freshRuntime();
    runtime.recordDecision('computer.use', GLOBAL, 'granted', 'always', true);
    runtime.revokeDevice(DEVICE);
    runtime.reinstateDevice(DEVICE);

    expect(runtime.authorizeRemoteCommand(DEVICE, 'computer.use', GLOBAL).allowed).toBe(true);
    expect(runtime.listRevokedDevices()).toHaveLength(0);
  });

  it('writes the revocation store so no other process can read it', async () => {
    const runtime = await freshRuntime();
    runtime.revokeDevice(DEVICE, 1_700_000_000_000);

    const stat = await fs.stat(path.join(userData, 'revoked-devices.json'));
    expect(stat.mode & 0o077).toBe(0);
    expect(runtime.listRevokedDevices()).toEqual([
      { deviceId: DEVICE, revokedAtMs: 1_700_000_000_000 },
    ]);
  });
});
