import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  EMPTY_CONNECTOR_TOOL_PERMISSIONS,
  LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS,
  loadConnectorToolPermissions,
} from '../connector-tool-permissions';

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

type QueryResult = unknown[];

function dbReturning(
  settingsResult: QueryResult | Error,
  permissionsResult: QueryResult | Error = [],
): DatabaseAdapter {
  const query = vi.fn(async (sql: string) => {
    const wantsSettings = sql.includes('user_settings');
    const result = wantsSettings ? settingsResult : permissionsResult;
    if (result instanceof Error) throw result;
    return result;
  });
  return { query } as unknown as DatabaseAdapter;
}

describe('lockdown mode gating connector tools', () => {
  beforeEach(() => vi.clearAllMocks());

  it('denies every connector tool when the account has lockdown on', async () => {
    const db = dbReturning(
      [{ settings: { lockdown: { enabled: true } } }],
      [{ connector_id: 'notion', tool_name: 'search', level: 'always-allow' }],
    );

    const permissions = await loadConnectorToolPermissions(db, 'user_1');

    expect(permissions).toBe(LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS);
    expect(permissions.isConnectorToolDenied('notion', 'search')).toBe(true);
    expect(permissions.isDenied('notion__search')).toBe(true);
  });

  it('overrides an always-allow verdict rather than deferring to it', async () => {
    const db = dbReturning(
      [{ settings: { lockdown: { enabled: true } } }],
      [{ connector_id: 'github', tool_name: 'fetch', level: 'always-allow' }],
    );

    const permissions = await loadConnectorToolPermissions(db, 'user_1');

    expect(permissions.levelForConnectorTool('github', 'fetch')).toBe('deny');
  });

  it('leaves saved verdicts alone when lockdown is off', async () => {
    const db = dbReturning(
      [{ settings: { lockdown: { enabled: false } } }],
      [
        { connector_id: 'notion', tool_name: 'search', level: 'always-allow' },
        { connector_id: 'notion', tool_name: 'delete', level: 'blocked' },
      ],
    );

    const permissions = await loadConnectorToolPermissions(db, 'user_1');

    expect(permissions.levelForConnectorTool('notion', 'search')).toBe('allow');
    expect(permissions.isConnectorToolDenied('notion', 'delete')).toBe(true);
    expect(permissions.isConnectorToolDenied('notion', 'search')).toBe(false);
  });

  it('treats an account that never set the preference as not locked down', async () => {
    const db = dbReturning(
      [{ settings: {} }],
      [{ connector_id: 'notion', tool_name: 'search', level: 'always-allow' }],
    );

    const permissions = await loadConnectorToolPermissions(db, 'user_1');

    expect(permissions.levelForConnectorTool('notion', 'search')).toBe('allow');
  });

  it('denies when the setting cannot be read, rather than failing open', async () => {
    const db = dbReturning(new Error('connection reset'), [
      { connector_id: 'notion', tool_name: 'search', level: 'always-allow' },
    ]);

    const permissions = await loadConnectorToolPermissions(db, 'user_1');

    expect(permissions).toBe(LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS);
  });

  it('resolves an anonymous caller before it reaches the settings query', async () => {
    const db = dbReturning(new Error('should not be queried'));

    const permissions = await loadConnectorToolPermissions(db, '');

    expect(permissions).toBe(EMPTY_CONNECTOR_TOOL_PERMISSIONS);
  });

  it('carries no entries to leak the connectors it is hiding', () => {
    expect(LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS.entries).toEqual([]);
    expect(LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS.size).toBe(0);
  });
});
