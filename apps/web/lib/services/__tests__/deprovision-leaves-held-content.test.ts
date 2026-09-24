import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  invalidateActiveOrganizationCache: vi.fn(async () => undefined),
}));
vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  evictOrgSharedConnectorCaches: vi.fn(async () => undefined),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { HOLDABLE_RESOURCES } from '@agiworkforce/types';

import { deprovisionMember } from '../deprovision-service';
import { revokeDirectorySyncGrants } from '../directory-sync-revocation';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';
const HELD_MEMBER = 'user-under-hold';

const HOLD_TABLES = [...new Set(HOLDABLE_RESOURCES.map((resource) => resource.table))];
const HOLD_REGISTRY_TABLE = 'legal_holds';

interface Recorded {
  sql: string;
  params: unknown[];
}

function recordingDb(revoked: string[]): { db: DatabaseAdapter; statements: Recorded[] } {
  const statements: Recorded[] = [];
  const run = async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes('delete from public.organization_members')) {
      return revoked.map((userId) => ({ user_id: userId }));
    }
    if (sql.includes("role = 'owner'")) return [{ count: '0' }];
    if (sql.includes('from public.organization_shared_connectors')) return [];
    return [];
  };
  const db = {
    query: run,
    execute: async (sql: string, params: unknown[] = []) => {
      await run(sql, params);
      return 0;
    },
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  } as unknown as DatabaseAdapter;
  return { db, statements };
}

const identity = {
  listUserSessions: vi.fn(async () => ({ sessions: [], totalCount: 0 })),
  revokeSession: vi.fn(async () => undefined),
};

function touches(statements: Recorded[], table: string): Recorded[] {
  const named = new RegExp(`\\b(?:public\\.)?${table}\\b`, 'i');
  return statements.filter((entry) => named.test(entry.sql));
}

describe('offboarding a member cuts their access without touching what a hold preserves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names no store a legal hold covers, for any resource type a hold can name', async () => {
    const { db, statements } = recordingDb([]);
    await deprovisionMember(db, identity, {
      userId: HELD_MEMBER,
      organizationId: ORGANIZATION_ID,
    });

    expect(statements.length).toBeGreaterThan(0);
    const reached = HOLD_TABLES.filter((table) => touches(statements, table).length > 0);
    expect(reached).toEqual([]);
  });

  it('leaves the hold itself alone, so the record outlives the membership', async () => {
    const { db, statements } = recordingDb([]);
    await deprovisionMember(db, identity, {
      userId: HELD_MEMBER,
      organizationId: ORGANIZATION_ID,
    });

    expect(touches(statements, HOLD_REGISTRY_TABLE)).toEqual([]);
  });

  it('revokes credentials the workspace issued and nothing wider', async () => {
    const { db, statements } = recordingDb([]);
    await deprovisionMember(db, identity, {
      userId: HELD_MEMBER,
      organizationId: ORGANIZATION_ID,
    });

    const writes = statements.filter((entry) => /^\s*(update|delete)/i.test(entry.sql));
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) {
      expect(write.sql).toMatch(/device_refresh_tokens|api_keys/);
      expect(write.sql).toContain('organization_id = $2');
      expect(write.params).toEqual([HELD_MEMBER, ORGANIZATION_ID]);
    }
  });

  it('holds the same line when the whole directory connection is withdrawn', async () => {
    const { db, statements } = recordingDb([HELD_MEMBER, 'user-second']);
    const result = await revokeDirectorySyncGrants(db, identity, {
      organizationId: ORGANIZATION_ID,
      connectionId: CONNECTION_ID,
    });

    expect(result.membersDeprovisioned).toBe(2);
    const reached = [...HOLD_TABLES, HOLD_REGISTRY_TABLE].filter(
      (table) => touches(statements, table).length > 0,
    );
    expect(reached).toEqual([]);
  });
});
