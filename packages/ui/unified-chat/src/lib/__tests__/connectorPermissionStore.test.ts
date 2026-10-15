import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorPermissionLevel } from '@agiworkforce/types';
import {
  ConnectorPermissionsUnavailableError,
  getConnectorPermissionStore,
} from '../connectorPermissionStore';

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).__agi_cloud_db__;
});

describe('getConnectorPermissionStore, non-Tauri runtime', () => {
  it('reports its storage as unsupported rather than claiming a cloud backend', () => {
    expect(getConnectorPermissionStore().storage).toBe('unsupported');
  });

  it('set() rejects instead of resolving without writing', async () => {
    const store = getConnectorPermissionStore();
    await expect(
      store.set('github', 'create_issue', 'needs-approval' as ConnectorPermissionLevel, true),
    ).rejects.toBeInstanceOf(ConnectorPermissionsUnavailableError);
  });

  it('get() rejects instead of returning null (which reads as "not configured")', async () => {
    const store = getConnectorPermissionStore();
    await expect(store.get('github', 'create_issue')).rejects.toBeInstanceOf(
      ConnectorPermissionsUnavailableError,
    );
  });

  it('list() rejects instead of returning [] (which reads as "no permissions set")', async () => {
    const store = getConnectorPermissionStore();
    await expect(store.list('github')).rejects.toBeInstanceOf(ConnectorPermissionsUnavailableError);
  });

  it('reset() rejects instead of reporting a reset that did not happen', async () => {
    const store = getConnectorPermissionStore();
    await expect(store.reset()).rejects.toBeInstanceOf(ConnectorPermissionsUnavailableError);
  });

  it('a stray __agi_cloud_db__ global does not resurrect a write path', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__agi_cloud_db__ = {
      from: () => {
        throw new Error('the cloud store must not be reachable');
      },
      auth: { getUser: async () => ({ data: { user: { id: 'user-001' } }, error: null }) },
    };
    const store = getConnectorPermissionStore();
    await expect(
      store.set('github', 'create_issue', 'always-allow' as ConnectorPermissionLevel),
    ).rejects.toBeInstanceOf(ConnectorPermissionsUnavailableError);
  });
});

describe('getConnectorPermissionStore, Tauri runtime', () => {
  const invoke = vi.fn();

  async function tauriStore() {
    const module = await import('../connectorPermissionStore');
    return module.getConnectorPermissionStore();
  }

  beforeEach(() => {
    vi.resetModules();
    invoke.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__ = {};
    vi.doMock('@tauri-apps/api/core', () => ({ invoke }));
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__TAURI_INTERNALS__;
    vi.doUnmock('@tauri-apps/api/core');
    vi.resetModules();
  });

  it('list() carries the state of the store with the saved permissions', async () => {
    invoke.mockResolvedValue({
      store: { state: 'ok' },
      permissions: [{ toolName: 'create_issue', level: 'blocked', destructive: true }],
    });

    const store = await tauriStore();

    expect(store.storage).toBe('local-vault');
    await expect(store.list('github')).resolves.toEqual({
      store: { state: 'ok' },
      permissions: [{ toolName: 'create_issue', level: 'blocked', destructive: true }],
    });
    expect(invoke).toHaveBeenCalledWith('connector_permission_list', { connectorId: 'github' });
  });

  it('list() reports an unreadable store instead of an empty list that reads as "nothing set"', async () => {
    invoke.mockResolvedValue({
      store: {
        state: 'unreadable',
        reason: 'no available key opens this store',
        unlockMayFix: false,
      },
      permissions: [],
    });

    const listing = await (await tauriStore()).list('github');

    expect(listing.store).toEqual({
      state: 'unreadable',
      reason: 'no available key opens this store',
      unlockMayFix: false,
    });
  });

  it('list() rejects when the native side fails, rather than returning []', async () => {
    invoke.mockRejectedValue(new Error('cannot resolve app data dir'));

    await expect((await tauriStore()).list('github')).rejects.toThrow(
      'cannot resolve app data dir',
    );
  });

  it('reset() returns what the native side did with the old file', async () => {
    invoke.mockResolvedValue({ reset: true, keptAs: 'connector-permissions.unreadable-1.json' });

    await expect((await tauriStore()).reset()).resolves.toEqual({
      reset: true,
      keptAs: 'connector-permissions.unreadable-1.json',
    });
    expect(invoke).toHaveBeenCalledWith('connector_permission_reset');
  });
});
