import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  evict: vi.fn(),
}));

vi.mock('server-only', () => ({}));
type LoggerModule = typeof import('@/lib/logger');
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
type RlsDbModule = typeof import('@/lib/server/rls-db');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type UserConnectorToolsModule = typeof import('@/lib/user-connector-tools');
type CreationModule = typeof import('@/lib/connectors/custom-connector-creation');
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: async () => ({ db: { query: mocks.query }, userId: 'user-1' }),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: vi.fn(),
}));
vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<UserConnectorToolsModule>()),
  evictCustomConnectorCaches: (...args: unknown[]) => mocks.evict(...args),
}));
vi.mock('@/lib/connectors/custom-connector-creation', async (importOriginal) => ({
  ...(await importOriginal<CreationModule>()),
  createCustomConnector: vi.fn(),
}));
type OAuthAccessModule = typeof import('@/lib/connectors/oauth-access');
type CustomConnectionsModule = typeof import('@/lib/connectors/mcp-custom-connections');
vi.mock('@/lib/connectors/oauth-access', async (importOriginal) => ({
  ...(await importOriginal<OAuthAccessModule>()),
  disconnectConnectorOAuthGrant: vi.fn(),
}));
vi.mock('@/lib/connectors/mcp-custom-connections', async (importOriginal) => ({
  ...(await importOriginal<CustomConnectionsModule>()),
  clearConnectorToolPermissions: vi.fn(),
}));

import type { NextRequest } from 'next/server';

import { setPluginConnectorsEnabled } from '../plugin-connectors';

const REQUEST = {} as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue([{ id: 'row-1' }, { id: 'row-2' }]);
});

describe('setPluginConnectorsEnabled', () => {
  it('marks only the connectors that plugin added when it is turned off, and evicts them', async () => {
    await setPluginConnectorsEnabled(REQUEST, 'acme', false);
    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(String(sql)).toContain('installed_by_plugin = $2');
    expect(String(sql)).toContain('now()');
    expect(params).toEqual(['user-1', 'acme', false]);
    expect(mocks.evict.mock.calls).toEqual([
      ['user-1', 'row-1'],
      ['user-1', 'row-2'],
    ]);
  });

  it('clears the marker when the plugin is turned back on', async () => {
    await setPluginConnectorsEnabled(REQUEST, 'acme', true);
    expect(mocks.query.mock.calls[0]![1]).toEqual(['user-1', 'acme', true]);
    expect(String(mocks.query.mock.calls[0]![0])).toContain('then null');
  });

  it('never deletes a row or touches its credential', async () => {
    await setPluginConnectorsEnabled(REQUEST, 'acme', false);
    const sql = String(mocks.query.mock.calls[0]![0]).toLowerCase();
    expect(sql).not.toContain('delete');
    expect(sql).not.toContain('auth_header_enc');
  });

  it('evicts nothing when no connector changed', async () => {
    mocks.query.mockResolvedValue([]);
    await setPluginConnectorsEnabled(REQUEST, 'acme', false);
    expect(mocks.evict).not.toHaveBeenCalled();
  });
});
