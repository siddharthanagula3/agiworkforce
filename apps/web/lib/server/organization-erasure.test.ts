import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  deleteStoredMediaObjects: vi.fn(),
  invalidateActiveOrganizationCache: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  })),
}));
vi.mock('@/lib/server/media-storage', () => ({
  deleteStoredMediaObjects: (...args: unknown[]) => mocks.deleteStoredMediaObjects(...args),
}));
vi.mock('@/lib/server/request-context-cache', () => ({
  invalidateActiveOrganizationCache: (...args: unknown[]) =>
    mocks.invalidateActiveOrganizationCache(...args),
}));

import {
  ORGANIZATION_ANONYMIZED_COLUMNS,
  ORGANIZATION_SCOPED_TABLES,
  ORGANIZATION_UNDELETED_TABLES,
  eraseOrganizationData,
} from './organization-erasure';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../db/neon');

function schemaColumnsByTable(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').replace(/--[^\n]*/g, '');

    for (const match of sql.matchAll(
      /create table(?:\s+if not exists)?\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi,
    )) {
      const columns = tables.get(match[1]!) ?? new Set<string>();
      for (const line of match[2]!.split('\n')) {
        const column = /^\s*([a-z_]+)\s+[a-z]/i.exec(line);
        if (column) columns.add(column[1]!.toLowerCase());
      }
      tables.set(match[1]!, columns);
    }

    for (const match of sql.matchAll(
      /alter table\s+(?:if exists\s+)?(?:public\.)?(\w+)\s+add column(?:\s+if not exists)?\s+(\w+)/gi,
    )) {
      const columns = tables.get(match[1]!) ?? new Set<string>();
      columns.add(match[2]!.toLowerCase());
      tables.set(match[1]!, columns);
    }

    for (const match of sql.matchAll(/drop table(?:\s+if exists)?\s+(?:public\.)?(\w+)/gi)) {
      tables.delete(match[1]!);
    }
  }

  return tables;
}

function organizationScopedSchemaTables(): Map<string, Set<string>> {
  const scoped = new Map<string, Set<string>>();
  for (const [table, columns] of schemaColumnsByTable()) {
    if (columns.has('organization_id')) scoped.set(table, columns);
  }
  return scoped;
}

interface ErasureFixture {
  mediaRows?: Array<{ id: string; storage_pathname: string | null }>;
  failStatementMatching?: string;
  underLegalHold?: boolean;
  legalHoldError?: Error;
  members?: Array<{ user_id: string }>;
}

function primeDb(fixture: ErasureFixture = {}): void {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('public.legal_holds')) {
      if (fixture.legalHoldError) throw fixture.legalHoldError;
      return [{ held: fixture.underLegalHold ?? false }];
    }
    if (sql.includes('select user_id from public.organization_members')) {
      return fixture.members ?? [];
    }
    if (sql.includes('media_assets')) return fixture.mediaRows ?? [];
    return [];
  });
  mocks.execute.mockImplementation(async (sql: string) => {
    if (fixture.failStatementMatching && sql.includes(fixture.failStatementMatching)) {
      throw new Error('deadlock detected');
    }
    return 1;
  });
  mocks.deleteStoredMediaObjects.mockResolvedValue({ deleted: 0, failedPathnames: [] });
}

function executedStatements(): string[] {
  return mocks.execute.mock.calls.map((call) => String(call[0]));
}

describe('organization erasure inventory', () => {
  it('classifies every organization-scoped table in the schema', () => {
    const scoped = organizationScopedSchemaTables();
    const deleted = new Set(ORGANIZATION_SCOPED_TABLES.map((entry) => entry.table));
    const anonymized = new Set(ORGANIZATION_ANONYMIZED_COLUMNS.map((entry) => entry.table));
    const undeleted = new Set(Object.keys(ORGANIZATION_UNDELETED_TABLES));

    expect(scoped.size).toBeGreaterThan(30);

    const unclassified = [...scoped.keys()]
      .filter((table) => !deleted.has(table) && !anonymized.has(table) && !undeleted.has(table))
      .sort();
    expect(unclassified).toEqual([]);
  });

  it('classifies each table exactly once, by a column that exists', () => {
    const scoped = organizationScopedSchemaTables();
    const buckets = [
      ORGANIZATION_SCOPED_TABLES.map((entry) => entry.table),
      ORGANIZATION_ANONYMIZED_COLUMNS.map((entry) => entry.table),
      Object.keys(ORGANIZATION_UNDELETED_TABLES),
    ];

    const seen = new Map<string, number>();
    buckets.forEach((bucket, index) => {
      for (const table of bucket) {
        expect(seen.has(table), `${table} is classified twice`).toBe(false);
        seen.set(table, index);
      }
    });

    for (const table of seen.keys()) {
      expect(
        scoped.has(table),
        `${table} is classified but not organization-scoped in the schema`,
      ).toBe(true);
    }
  });
});

describe('eraseOrganizationData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks the whole purge when an active legal hold exists, and touches nothing', async () => {
    primeDb({ underLegalHold: true });

    const report = await eraseOrganizationData('org-1');

    expect(report.complete).toBe(false);
    expect(report.blockedByLegalHold).toBe(true);
    expect(report.organizationRetained).toBe(true);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('fails closed when hold status cannot be read', async () => {
    primeDb({ legalHoldError: new Error('connection reset') });

    const report = await eraseOrganizationData('org-1');

    expect(report.complete).toBe(false);
    expect(report.blockedByLegalHold).toBe(true);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('erases every scoped table, anonymizes billing history, and deletes the organization row', async () => {
    primeDb();

    const report = await eraseOrganizationData('org-1');

    expect(report.complete).toBe(true);
    expect(report.organizationRetained).toBe(false);
    expect(report.blockedByLegalHold).toBe(false);

    const statements = executedStatements();
    for (const { table } of ORGANIZATION_SCOPED_TABLES) {
      if (table === 'media_assets' || table === 'organization_members') continue;
      expect(
        statements.some((sql) =>
          sql.includes(`delete from public.${table} where organization_id = $1`),
        ),
      ).toBe(true);
    }
    expect(
      statements.some((sql) =>
        sql.includes('update public.organization_usage_ledger set organization_id = null'),
      ),
    ).toBe(true);
    expect(
      statements.some((sql) =>
        sql.includes('update public.enterprise_audit_events set organization_id = null'),
      ),
    ).toBe(true);
    expect(
      statements.some((sql) => sql.includes('delete from public.organizations where id = $1')),
    ).toBe(true);
    expect(report.tables['organization_members']).toEqual({ deleted: true });
  });

  it('retains the tenant audit trail, detaching only the organization reference', async () => {
    primeDb();

    const report = await eraseOrganizationData('org-1');

    expect(report.anonymized['enterprise_audit_events']).toEqual({ updated: true });
    expect(report.tables['enterprise_audit_events']).toBeUndefined();
    expect(
      executedStatements().some((sql) =>
        sql.includes('delete from public.enterprise_audit_events where organization_id = $1'),
      ),
    ).toBe(false);
  });

  it('never deletes organization_members directly, only through the final row cascade', async () => {
    // assert_organization_has_owner() (0085_organization_seats_lifecycle) fails
    // a direct delete of the last owner while the organizations row still
    // exists; membership must go only when the row itself does.
    primeDb();

    await eraseOrganizationData('org-1');

    expect(
      executedStatements().some((sql) =>
        sql.includes('delete from public.organization_members where organization_id = $1'),
      ),
    ).toBe(false);
  });

  it('deletes storage-backed media bytes before the row, and reports failures', async () => {
    primeDb({
      mediaRows: [
        { id: 'm1', storage_pathname: 'orgs/org-1/m1.png' },
        { id: 'm2', storage_pathname: 'orgs/org-1/m2.png' },
      ],
    });
    mocks.deleteStoredMediaObjects.mockResolvedValue({
      deleted: 1,
      failedPathnames: ['orgs/org-1/m2.png'],
    });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('public.legal_holds')) return [{ held: false }];
      if (sql.includes('select id, storage_pathname from public.media_assets')) {
        return [
          { id: 'm1', storage_pathname: 'orgs/org-1/m1.png' },
          { id: 'm2', storage_pathname: 'orgs/org-1/m2.png' },
        ];
      }
      if (sql.includes('delete from public.media_assets where id = any')) {
        return [{ id: 'm1' }];
      }
      return [];
    });

    const report = await eraseOrganizationData('org-1');

    expect(report.mediaObjectsDeleted).toBe(1);
    expect(report.mediaObjectsFailed).toBe(1);
    expect(report.mediaRowsDeleted).toBe(1);
    expect(report.complete).toBe(false);
    expect(report.organizationRetained).toBe(true);
  });

  it('leaves a failing table retained for retry and keeps the organization row', async () => {
    primeDb({ failStatementMatching: 'delete from public.sso_connections' });

    const report = await eraseOrganizationData('org-1');

    expect(report.tables['sso_connections']?.deleted).toBe(false);
    expect(report.tables['sso_connections']?.error).toBeDefined();
    expect(report.complete).toBe(false);
    expect(report.organizationRetained).toBe(true);
    expect(
      executedStatements().some((sql) =>
        sql.includes('delete from public.organizations where id = $1'),
      ),
    ).toBe(false);
  });

  it("invalidates each removed member's active-organization cache after the row delete succeeds", async () => {
    primeDb({ members: [{ user_id: 'user-1' }, { user_id: 'user-2' }] });

    await eraseOrganizationData('org-1');

    expect(mocks.invalidateActiveOrganizationCache).toHaveBeenCalledTimes(2);
    expect(mocks.invalidateActiveOrganizationCache).toHaveBeenCalledWith('user-1');
    expect(mocks.invalidateActiveOrganizationCache).toHaveBeenCalledWith('user-2');
  });

  it('does not invalidate any member cache when the organization row delete fails', async () => {
    primeDb({
      members: [{ user_id: 'user-1' }],
      failStatementMatching: 'delete from public.organizations where id = $1',
    });

    const report = await eraseOrganizationData('org-1');

    expect(report.organizationRetained).toBe(true);
    expect(mocks.invalidateActiveOrganizationCache).not.toHaveBeenCalled();
  });

  it('retains the organization row when retainOrganizationRow is set', async () => {
    primeDb();

    const report = await eraseOrganizationData('org-1', { retainOrganizationRow: true });

    expect(report.complete).toBe(true);
    expect(report.organizationRetained).toBe(true);
    expect(
      executedStatements().some((sql) =>
        sql.includes('delete from public.organizations where id = $1'),
      ),
    ).toBe(false);
  });
});
