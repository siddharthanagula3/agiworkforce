import { DatabaseSync } from 'node:sqlite';
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
  it.each([false, true])(
    'persists enabled=%s only for the owning user and plugin, then leaves it unchanged',
    async (enabled) => {
      const database = new DatabaseSync(':memory:');
      const previousTimestamp = '2026-10-29T12:00:00.000Z';
      const changedTimestamp = '2026-10-30T12:00:00.000Z';
      try {
        database.function('now', () => changedTimestamp);
        database.exec(`
          attach database ':memory:' as public;
          create table public.user_custom_connectors (
            id text primary key,
            user_id text not null,
            installed_by_plugin text,
            disabled_by_plugin_at text,
            updated_at text not null,
            auth_header_enc text not null
          )
        `);
        const rows = [
          ['enabled', 'user-1', 'acme', null, previousTimestamp, 'credential-1'],
          ['disabled', 'user-1', 'acme', previousTimestamp, previousTimestamp, 'credential-2'],
          ['other-user', 'user-2', 'acme', null, previousTimestamp, 'credential-3'],
          ['other-plugin', 'user-1', 'other', null, previousTimestamp, 'credential-4'],
          ['manual', 'user-1', null, null, previousTimestamp, 'credential-5'],
        ];
        const insert = database.prepare(
          'insert into public.user_custom_connectors values (?, ?, ?, ?, ?, ?)',
        );
        for (const row of rows) insert.run(...row);
        mocks.query.mockImplementation(async (sql: string, params: [string, string, boolean]) =>
          database.prepare(sql).all({ $1: params[0], $2: params[1], $3: Number(params[2]) }),
        );

        await setPluginConnectorsEnabled(REQUEST, 'acme', enabled);

        const readRows = () =>
          database.prepare('select * from public.user_custom_connectors order by id').all();
        const expected = rows
          .map(([id, userId, pluginKey, disabledAt, updatedAt, credential]) => ({
            id,
            user_id: userId,
            installed_by_plugin: pluginKey,
            disabled_by_plugin_at:
              userId === 'user-1' && pluginKey === 'acme'
                ? enabled
                  ? null
                  : (disabledAt ?? changedTimestamp)
                : disabledAt,
            updated_at: id === (enabled ? 'disabled' : 'enabled') ? changedTimestamp : updatedAt,
            auth_header_enc: credential,
          }))
          .sort((left, right) => String(left.id).localeCompare(String(right.id)));
        expect(readRows()).toEqual(expected);
        expect(mocks.evict.mock.calls).toEqual([['user-1', enabled ? 'disabled' : 'enabled']]);

        mocks.evict.mockClear();
        await setPluginConnectorsEnabled(REQUEST, 'acme', enabled);
        expect(readRows()).toEqual(expected);
        expect(mocks.evict).not.toHaveBeenCalled();
      } finally {
        database.close();
      }
    },
  );

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
