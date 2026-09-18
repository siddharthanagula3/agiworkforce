import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { DesktopHostDeclaration } from '@agiworkforce/local-runtime-contract';
import {
  clearDeviceForRemoteSteps,
  readRegisteredDevice,
  stopRemoteWorkOnDevice,
  type RegisteredDevice,
} from '../device-registry';

const NOW = Date.parse('2026-09-18T12:00:00.000Z');
const INSTALL_ID = 'install-abcdefgh';
const DEVICE_ID = '0190a000-0000-7000-8000-0000000000aa';

function declaration(
  capabilities: DesktopHostDeclaration['capabilities'] = ['computer.use'],
): DesktopHostDeclaration {
  return {
    deviceId: INSTALL_ID,
    deviceName: 'Work MacBook',
    platform: 'darwin',
    appVersion: '1.4.0',
    capabilities,
    roots: [{ id: 'root-1', name: 'Documents', path: '/Users/a/Documents' }],
  };
}

function registration(overrides: Partial<RegisteredDevice> = {}): RegisteredDevice {
  return {
    id: '0190a000-0000-7000-8000-0000000000aa',
    surface: 'desktop',
    name: 'Work MacBook',
    lastSeenAt: new Date(NOW).toISOString(),
    presence: 'online',
    remoteEnabled: true,
    capabilities: {
      browser: true,
      computerUse: true,
      localModels: false,
      localMcp: false,
      remoteControl: true,
    },
    authenticated: true,
    ...overrides,
  };
}

function database(rows: unknown[] | Error): DatabaseAdapter {
  return {
    query: vi.fn(async () => {
      if (rows instanceof Error) throw rows;
      return rows;
    }),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  } as unknown as DatabaseAdapter;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    device_id: '0190a000-0000-7000-8000-0000000000aa',
    surface: 'desktop',
    name: 'Work MacBook',
    last_seen_at: new Date(NOW - 60_000).toISOString(),
    remote_enabled: true,
    browser_available: true,
    computer_use_available: true,
    local_models_available: false,
    local_mcp_available: false,
    credential_family_id: 'family-1',
    identity_session_id: null,
    live_credential: true,
    ...overrides,
  };
}

describe('reading a device out of the registry', () => {
  it('derives presence and capabilities from the registered row', async () => {
    const device = await readRegisteredDevice(database([row()]), {
      userId: 'user-1',
      surface: 'desktop',
      installId: INSTALL_ID,
      now: NOW,
    });

    expect(device).toMatchObject({
      id: '0190a000-0000-7000-8000-0000000000aa',
      presence: 'online',
      remoteEnabled: true,
      authenticated: true,
    });
    expect(device?.capabilities.computerUse).toBe(true);
  });

  it('reads a device whose credential family was revoked as unauthenticated', async () => {
    const device = await readRegisteredDevice(database([row({ live_credential: false })]), {
      userId: 'user-1',
      surface: 'desktop',
      installId: INSTALL_ID,
      now: NOW,
    });

    expect(device?.authenticated).toBe(false);
  });

  it('treats a device with no recorded credential and no session as unauthenticated', async () => {
    const device = await readRegisteredDevice(
      database([row({ credential_family_id: null, live_credential: null })]),
      { userId: 'user-1', surface: 'desktop', installId: INSTALL_ID, now: NOW },
    );

    expect(device?.authenticated).toBe(false);
  });

  it('reports a stale heartbeat as sleeping rather than online', async () => {
    const device = await readRegisteredDevice(
      database([row({ last_seen_at: new Date(NOW - 3 * 60 * 60_000).toISOString() })]),
      { userId: 'user-1', surface: 'desktop', installId: INSTALL_ID, now: NOW },
    );

    expect(device?.presence).toBe('sleeping');
  });

  it('degrades to no device while the registry table is still unapplied', async () => {
    const missing = Object.assign(new Error('relation "device_registrations" does not exist'), {
      code: '42P01',
    });

    await expect(
      readRegisteredDevice(database(missing), {
        userId: 'user-1',
        surface: 'desktop',
        installId: INSTALL_ID,
        now: NOW,
      }),
    ).resolves.toBeNull();
  });

  it('propagates any other database failure rather than reading it as absence', async () => {
    await expect(
      readRegisteredDevice(database(new Error('connection reset')), {
        userId: 'user-1',
        surface: 'desktop',
        installId: INSTALL_ID,
        now: NOW,
      }),
    ).rejects.toThrow(/connection reset/);
  });
});

describe('clearing a device for remote steps', () => {
  it('allows a paired, awake, authenticated device that still offers screen control', () => {
    expect(clearDeviceForRemoteSteps(declaration(), registration())).toEqual({
      decision: 'ready',
      deviceId: '0190a000-0000-7000-8000-0000000000aa',
    });
  });

  it('withdraws a declaration naming a device this account never registered', () => {
    const clearance = clearDeviceForRemoteSteps(declaration(), null);

    expect(clearance.decision).toBe('withdrawn');
    expect(clearance).toMatchObject({ reason: expect.stringContaining('not a device registered') });
  });

  it('withdraws a device whose credential was revoked', () => {
    expect(
      clearDeviceForRemoteSteps(declaration(), registration({ authenticated: false })).decision,
    ).toBe('withdrawn');
  });

  it('withdraws a device the user switched remote work off on', () => {
    expect(
      clearDeviceForRemoteSteps(declaration(), registration({ remoteEnabled: false })).decision,
    ).toBe('withdrawn');
  });

  it('withdraws a screen step from a device that no longer reports computer use', () => {
    const device = registration({
      capabilities: {
        browser: true,
        computerUse: false,
        localModels: false,
        localMcp: false,
        remoteControl: true,
      },
    });

    expect(clearDeviceForRemoteSteps(declaration(), device).decision).toBe('withdrawn');
  });

  it('still allows a file-only declaration on a device that reports no computer use', () => {
    const device = registration({
      capabilities: {
        browser: true,
        computerUse: false,
        localModels: false,
        localMcp: false,
        remoteControl: true,
      },
    });

    expect(clearDeviceForRemoteSteps(declaration(['filesystem.read']), device).decision).toBe(
      'ready',
    );
  });

  it('waits rather than withdrawing when the paired device is merely asleep', () => {
    const clearance = clearDeviceForRemoteSteps(
      declaration(),
      registration({ presence: 'sleeping' }),
    );

    expect(clearance.decision).toBe('wait');
    expect(clearance).toMatchObject({ retryInMs: expect.any(Number) });
  });

  it('waits on an offline device too, because it can still report back in', () => {
    expect(
      clearDeviceForRemoteSteps(declaration(), registration({ presence: 'offline' })).decision,
    ).toBe('wait');
  });
});

describe('reaching a device on any surface it registered from', () => {
  it('matches on the install id alone when no surface is named', async () => {
    const db = database([row({ surface: 'vscode' })]);

    const device = await readRegisteredDevice(db, {
      userId: 'user-1',
      installId: INSTALL_ID,
      now: NOW,
    });

    expect(device?.surface).toBe('vscode');
    expect(vi.mocked(db.query).mock.calls[0]?.[1]).toEqual(['user-1', null, INSTALL_ID]);
  });

  it('still narrows to one surface when the caller names one', async () => {
    const db = database([row()]);

    await readRegisteredDevice(db, {
      userId: 'user-1',
      surface: 'cli',
      installId: INSTALL_ID,
      now: NOW,
    });

    expect(vi.mocked(db.query).mock.calls[0]?.[1]).toEqual(['user-1', 'cli', INSTALL_ID]);
  });
});

describe('stopping remote work on one device', () => {
  function stoppable(affected: number | Error): DatabaseAdapter {
    return {
      query: vi.fn(),
      execute: vi.fn(async () => {
        if (affected instanceof Error) throw affected;
        return affected;
      }),
      transaction: vi.fn(),
      withUser: vi.fn(),
      dispose: vi.fn(),
    } as unknown as DatabaseAdapter;
  }

  it('withdraws the device from remote work without touching its credential', async () => {
    const db = stoppable(1);

    await expect(
      stopRemoteWorkOnDevice(db, { userId: 'user-1', deviceId: DEVICE_ID }),
    ).resolves.toBe(true);

    const [sql, params] = vi.mocked(db.execute).mock.calls[0]!;
    expect(sql).toContain('remote_enabled = false');
    expect(sql).not.toMatch(/device_refresh_tokens|delete/i);
    expect(params).toEqual([DEVICE_ID, 'user-1']);
  });

  it('reports no change for a device that had already stopped', async () => {
    await expect(
      stopRemoteWorkOnDevice(stoppable(0), { userId: 'user-1', deviceId: DEVICE_ID }),
    ).resolves.toBe(false);
  });

  it('leaves a run unblocked while the registry table is still unapplied', async () => {
    const missing = Object.assign(new Error('relation "device_registrations" does not exist'), {
      code: '42P01',
    });

    await expect(
      stopRemoteWorkOnDevice(stoppable(missing), { userId: 'user-1', deviceId: DEVICE_ID }),
    ).resolves.toBe(false);
  });

  it('withdraws a device the next clearance reads, so a run in flight loses its tools', () => {
    const stopped = registration({ remoteEnabled: false });
    expect(clearDeviceForRemoteSteps(declaration(), stopped)).toMatchObject({
      decision: 'withdrawn',
    });
  });
});
