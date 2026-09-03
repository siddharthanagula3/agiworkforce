import { afterEach, describe, expect, it } from 'vitest';
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
