import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  evict: vi.fn(),
  clearPermissions: vi.fn(),
  deleteInstallation: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule5>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../account/context-resolver', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule4>()),
  resolveSupportAccountContext: vi.fn(),
}));
vi.mock('@/lib/connectors/mcp-custom-connections', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule3>()),
  clearConnectorToolPermissions: (...args: unknown[]) => mocks.clearPermissions(...args),
}));
vi.mock('@/lib/connectors/oauth-access', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  disconnectConnectorOAuthGrant: (...args: unknown[]) => mocks.disconnect(...args),
}));
vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  evictConnectorOAuthCaches: (...args: unknown[]) => mocks.evict(...args),
}));
vi.mock('@/lib/github-app', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  deleteGitHubAppInstallation: (...args: unknown[]) => mocks.deleteInstallation(...args),
}));

import { SupportActionRefusal } from '../types';
import { executeRevokeConnector } from '../executors/revoke-connector';

const USER = 'user_a';

function dbWith(installations: Array<{ installation_id: number }> = []) {
  const execute = vi.fn(async (_sql: string, _params?: unknown[]) => 1);
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => installations);
  return { db: { execute, query } as unknown as DatabaseAdapter, execute };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.disconnect.mockResolvedValue({
    disconnected: true,
    vendorRevocation: { status: 'revoked' },
  });
  mocks.evict.mockResolvedValue(undefined);
  mocks.clearPermissions.mockResolvedValue(true);
  mocks.deleteInstallation.mockResolvedValue({ status: 'deleted' });
});

describe('support action revoke_connector', () => {
  it('removes the grant through the canonical disconnect before it deactivates the row', async () => {
    const { db, execute } = dbWith();

    const result = await executeRevokeConnector({ db, userId: USER, connectorId: 'linear' });

    expect(mocks.disconnect).toHaveBeenCalledWith(USER, 'linear');
    expect(mocks.evict).toHaveBeenCalledWith(USER, 'linear');
    expect(String(execute.mock.calls[0]?.[0])).toContain('update user_connectors');
    expect(mocks.clearPermissions).toHaveBeenCalledWith(db, USER, 'linear');
    expect(result).toMatchObject({
      kind: 'completed',
      message: expect.stringContaining('saved tool permissions were cleared'),
    });
  });

  it('does not claim the saved permissions were cleared when clearing them failed', async () => {
    mocks.clearPermissions.mockResolvedValue(false);
    const { db } = dbWith();

    const result = await executeRevokeConnector({ db, userId: USER, connectorId: 'linear' });

    expect(result.kind).toBe('completed');
    if (result.kind !== 'completed') return;
    expect(result.message).toContain('could not be cleared');
    expect(result.message).not.toContain('were cleared');
  });

  it('uninstalls the GitHub App at GitHub before it forgets the installation', async () => {
    const { db, execute } = dbWith([{ installation_id: 41 }]);

    await executeRevokeConnector({ db, userId: USER, connectorId: 'github' });

    expect(mocks.deleteInstallation).toHaveBeenCalledWith(41);
    expect(String(execute.mock.calls[0]?.[0])).toContain('delete from github_installations');
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it.each([
    ['failed', 502],
    ['unavailable', 503],
  ] as const)(
    'refuses and keeps the installation when GitHub reports %s',
    async (status, httpStatus) => {
      mocks.deleteInstallation.mockResolvedValue({ status, reason: 'nope' });
      const { db, execute } = dbWith([{ installation_id: 41 }]);

      const refusal = await executeRevokeConnector({
        db,
        userId: USER,
        connectorId: 'github',
      }).catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(SupportActionRefusal);
      expect((refusal as SupportActionRefusal).status).toBe(httpStatus);
      expect(execute).not.toHaveBeenCalled();
      expect(mocks.clearPermissions).not.toHaveBeenCalled();
    },
  );
});

type ImportedModule5 = typeof import('@/lib/logger');
type ImportedModule4 = typeof import('../../account/context-resolver');
type ImportedModule3 = typeof import('@/lib/connectors/mcp-custom-connections');
type ImportedModule2 = typeof import('@/lib/connectors/oauth-access');
type ImportedModule1 = typeof import('@/lib/user-connector-tools');
type ImportedModule0 = typeof import('@/lib/github-app');
