import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { connectorCategoryToolName } from '@agiworkforce/cloud-contracts';

import {
  LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS,
  loadConnectorToolPermissions,
  readDisabledConnectorIds,
  scopeConnectorPermissionsToTurn,
} from '../connector-tool-permissions';

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

type Rows = unknown[];

function dbWith(tables: { accountStates?: Rows | Error; permissions?: Rows }): {
  db: DatabaseAdapter;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('user_settings')) return [{ settings: {} }];
    if (sql.includes('connector_account_states')) {
      if (tables.accountStates instanceof Error) throw tables.accountStates;
      return tables.accountStates ?? [];
    }
    if (sql.includes('connector_tool_permissions')) return tables.permissions ?? [];
    return [];
  });
  return { db: { query } as unknown as DatabaseAdapter, query };
}

const SAVED_ALLOWS: Rows = [
  { connector_id: 'notion', tool_name: 'search', level: 'always-allow' },
  { connector_id: 'notion', tool_name: 'create_page', level: 'always-allow' },
  { connector_id: 'notion', tool_name: connectorCategoryToolName('read_only'), level: 'blocked' },
  { connector_id: 'notion', tool_name: connectorCategoryToolName('write'), level: 'blocked' },
  { connector_id: 'github', tool_name: 'fetch', level: 'always-allow' },
];

describe('a connector switched off for the whole account', () => {
  beforeEach(() => vi.clearAllMocks());

  it('denies every tool of it, even ones a per-tool verdict allows', async () => {
    const { db } = dbWith({
      accountStates: [{ connector_id: 'notion' }],
      permissions: SAVED_ALLOWS,
    });

    const permissions = await loadConnectorToolPermissions(db, 'user_1', null);

    expect(permissions.isConnectorDenied('notion')).toBe(true);
    expect(permissions.levelForConnectorTool('notion', 'search')).toBe('deny');
    expect(permissions.levelForConnectorTool('notion', 'create_page')).toBe('deny');
    expect(permissions.levelForConnectorTool('notion', 'never_saved')).toBe('deny');
    expect(permissions.isConnectorToolDenied('notion', 'search')).toBe(true);
    expect(permissions.isDenied('mcp__notion__search')).toBe(true);
    expect(permissions.levelFor('mcp__notion__search')).toBe('deny');
    expect(permissions.canRememberApproval?.('mcp__notion__search')).toBe(false);
  });

  it('leaves every other connector on its saved verdicts', async () => {
    const { db } = dbWith({
      accountStates: [{ connector_id: 'notion' }],
      permissions: SAVED_ALLOWS,
    });

    const permissions = await loadConnectorToolPermissions(db, 'user_1', null);

    expect(permissions.isConnectorDenied('github')).toBe(false);
    expect(permissions.levelForConnectorTool('github', 'fetch')).toBe('allow');
  });

  it('stays off inside a turn, a temporary chat and a turn that opted nothing out', async () => {
    const { db } = dbWith({
      accountStates: [{ connector_id: 'notion' }],
      permissions: SAVED_ALLOWS,
    });

    const saved = await loadConnectorToolPermissions(db, 'user_1', null);
    for (const temporary of [false, true]) {
      const turn = scopeConnectorPermissionsToTurn(saved, {
        temporary,
        disabledConnectorIds: [],
      });
      expect(turn.isConnectorDenied('notion')).toBe(true);
      expect(turn.isDenied('mcp__notion__search')).toBe(true);
    }
  });

  it('reads only the switched-off rows of the signed-in account', async () => {
    const { db, query } = dbWith({ accountStates: [] });

    await loadConnectorToolPermissions(db, 'user_1', null);

    const call = query.mock.calls.find(([sql]) =>
      String(sql).includes('connector_account_states'),
    ) as [string, unknown[]];
    expect(call[0]).toContain('where user_id = $1 and not enabled');
    expect(call[1]).toEqual(['user_1']);
  });

  it('denies every connector when the switches cannot be read', async () => {
    const { db } = dbWith({
      accountStates: new Error('relation "connector_account_states" does not exist'),
      permissions: SAVED_ALLOWS,
    });

    const permissions = await loadConnectorToolPermissions(db, 'user_1', null);

    expect(permissions).toBe(LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS);
    expect(permissions.isConnectorDenied('github')).toBe(true);
    expect(permissions.levelForConnectorTool('github', 'fetch')).toBe('deny');
  });

  it('turns nothing off when the account switched nothing off', async () => {
    const { db } = dbWith({ accountStates: [], permissions: SAVED_ALLOWS });

    const permissions = await loadConnectorToolPermissions(db, 'user_1', null);

    expect(permissions.isConnectorDenied('notion')).toBe(false);
    expect(permissions.levelForConnectorTool('notion', 'search')).toBe('allow');
  });

  it('lets readDisabledConnectorIds surface a read error to its caller', async () => {
    const { db } = dbWith({ accountStates: new Error('timeout') });

    await expect(readDisabledConnectorIds(db, 'user_1')).rejects.toThrow('timeout');
  });
});
