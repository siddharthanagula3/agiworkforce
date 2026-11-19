import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  deleteStoredMediaObjects: vi.fn(),
  invalidateActiveOrganizationCache: vi.fn(async (..._args: unknown[]) => undefined),
  cancelLiveStripeSubscriptionsNow: vi.fn(),
  resolveObjectBackupTarget: vi.fn(
    (): { store: unknown; bucket: string; region: string; endpoint: string } | null => null,
  ),
  deleteBackupObject: vi.fn(async (_key: string, _options?: unknown) => 'deleted'),
  forgetBackupReplicas: vi.fn(async (_keys: readonly string[]) => 0),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => {
    const db = {
      query: (...args: unknown[]) => mocks.query(...args),
      execute: (...args: unknown[]) => mocks.execute(...args),
      transaction: async (work: (tx: unknown) => Promise<unknown>) => work(db),
    };
    return db;
  }),
}));
vi.mock('@/lib/server/media-storage', () => ({
  deleteStoredMediaObjects: (...args: unknown[]) => mocks.deleteStoredMediaObjects(...args),
}));
vi.mock('@/lib/server/payments/stripe-provider', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  cancelLiveStripeSubscriptionsNow: (...args: unknown[]) =>
    mocks.cancelLiveStripeSubscriptionsNow(...args),
}));
vi.mock('@/lib/server/request-context-cache', () => ({
  invalidateActiveOrganizationCache: (...args: unknown[]) =>
    mocks.invalidateActiveOrganizationCache(...args),
}));
vi.mock('@/lib/server/object-backup', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  resolveObjectBackupTarget: () => mocks.resolveObjectBackupTarget(),
  deleteBackupObject: (key: string, options?: unknown) => mocks.deleteBackupObject(key, options),
  forgetBackupReplicas: (keys: readonly string[]) => mocks.forgetBackupReplicas(keys),
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
  activeLegalHolds?: number;
  legalHoldError?: Error;
  members?: Array<{ user_id: string }>;
  seatSubscriptionId?: string;
  lockdownDefinition?: 'missing' | 'read-error' | 'insert-error';
}

function primeDb(fixture: ErasureFixture = {}): void {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('public.feature_flag_definitions')) {
      if (fixture.lockdownDefinition === 'read-error') throw new Error('flag read unavailable');
      if (fixture.lockdownDefinition === 'insert-error' && sql.includes('insert into')) {
        throw new Error('flag insert unavailable');
      }
      if (fixture.lockdownDefinition) return [];
      return [
        {
          key: 'tenant.lockdown',
          description: '',
          kill_switch: false,
          variants: ['on', 'off'],
          default_variant: 'on',
          rules: [],
          expires_at: null,
          maturity: null,
          release_channel: null,
          availability: null,
          owner_name: null,
          archived_at: null,
          version: 1,
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-09-01T00:00:00.000Z',
        },
      ];
    }
    if (sql.includes('public.legal_holds')) {
      if (fixture.legalHoldError) throw fixture.legalHoldError;
      return [{ count: fixture.activeLegalHolds ?? (fixture.underLegalHold ? 1 : 0) }];
    }
    if (sql.includes('select user_id from public.organization_members')) {
      return fixture.members ?? [];
    }
    if (sql.includes('media_assets')) return fixture.mediaRows ?? [];
    if (sql.includes('select stripe_subscription_id from public.organizations')) {
      return [{ stripe_subscription_id: fixture.seatSubscriptionId ?? null }];
    }
    return [];
  });
  mocks.execute.mockImplementation(async (sql: string) => {
    if (fixture.failStatementMatching && sql.includes(fixture.failStatementMatching)) {
      throw new Error('deadlock detected');
    }
    return 1;
  });
  mocks.deleteStoredMediaObjects.mockResolvedValue({ deleted: 0, failedPathnames: [] });
  mocks.cancelLiveStripeSubscriptionsNow.mockResolvedValue(
    fixture.seatSubscriptionId ? [fixture.seatSubscriptionId] : [],
  );
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

  it('deletes organization voice and automation rows while leaving custody to the final cascade', () => {
    const deleted = new Set(ORGANIZATION_SCOPED_TABLES.map((entry) => entry.table));
    const retained = new Set(Object.keys(ORGANIZATION_UNDELETED_TABLES));

    expect(deleted.has('voice_sessions')).toBe(true);
    expect(deleted.has('automation_audit_events')).toBe(true);
    expect(retained.has('ediscovery_exports')).toBe(true);
  });

  it('defers workspace flags, including the erasure lock, to the final organization cascade', () => {
    expect(ORGANIZATION_SCOPED_TABLES.some(({ table }) => table === 'feature_flags')).toBe(false);
    expect(ORGANIZATION_UNDELETED_TABLES['feature_flags']).toBeDefined();
    const migration = readFileSync(
      path.join(MIGRATIONS_DIR, '0211_feature_flag_targeting.sql'),
      'utf8',
    );
    expect(migration).toContain(
      'add column if not exists organization_id uuid references public.organizations(id) on delete cascade',
    );
  });

  it('keeps direct eDiscovery mutation blocked while admitting only the parent cascade', () => {
    const migration = readFileSync(
      path.join(MIGRATIONS_DIR, '0273_ediscovery_cascade_delete.sql'),
      'utf8',
    );

    expect(migration).toContain("tg_op = 'DELETE'");
    expect(migration).toContain('not exists');
    expect(migration).toContain('from public.organizations');
    expect(migration).toContain('where id = old.organization_id');
    expect(migration).toContain('raise exception');
  });
});

describe('eraseOrganizationData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveObjectBackupTarget.mockReset().mockReturnValue(null);
    mocks.deleteBackupObject.mockReset().mockResolvedValue('deleted');
    mocks.forgetBackupReplicas.mockReset().mockResolvedValue(0);
  });

  it('retains failed backup pointers and the workspace until a later cleanup succeeds', async () => {
    primeDb();
    let rows = [
      { id: 'a', organization_id: 'org-1', storage_pathname: 'private-media/a.png' },
      { id: 'b', organization_id: 'org-1', storage_pathname: 'private-media/b.png' },
      { id: 'c', organization_id: 'org-2', storage_pathname: 'private-media/c.png' },
    ];
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('select id, storage_pathname from public.media_assets')) {
        return rows.filter((row) => row.organization_id === params[0]);
      }
      if (sql.includes('delete from public.media_assets where id = any')) {
        const ids = params[0] as string[];
        const removed = rows.filter((row) => ids.includes(row.id));
        rows = rows.filter((row) => !ids.includes(row.id));
        return removed;
      }
      return query(sql);
    });
    mocks.deleteStoredMediaObjects.mockImplementation(async (paths: string[]) => ({
      deleted: paths.length,
      failedPathnames: [],
    }));
    mocks.resolveObjectBackupTarget.mockReturnValue({
      store: {},
      bucket: 'backup',
      region: 'us-west-1',
      endpoint: 'https://backup',
    });
    mocks.deleteBackupObject.mockRejectedValueOnce(new Error('backup unavailable'));

    const first = await eraseOrganizationData('org-1');

    expect(first.backupObjectsFailed).toBe(1);
    expect(first.backupObjectsDeleted).toBe(1);
    expect(first.mediaRowsDeleted).toBe(1);
    expect(first.complete).toBe(false);
    expect(first.organizationRetained).toBe(true);
    expect(first.tables['media_assets']).toEqual({ deleted: false, retainedForRetry: true });
    expect(rows.map(({ id }) => id)).toEqual(['a', 'c']);
    expect(
      executedStatements().some((sql) => sql.includes('delete from public.organizations')),
    ).toBe(false);

    const second = await eraseOrganizationData('org-1');

    expect(second.backupObjectsFailed).toBe(0);
    expect(second.backupObjectsDeleted).toBe(1);
    expect(second.complete).toBe(true);
    expect(second.organizationRetained).toBe(false);
    expect(rows.map(({ id }) => id)).toEqual(['c']);
    expect(mocks.deleteBackupObject.mock.calls.map(([key]) => key)).toEqual([
      'private-media/a.png',
      'private-media/b.png',
      'private-media/a.png',
    ]);
    expect(mocks.forgetBackupReplicas).toHaveBeenNthCalledWith(1, ['private-media/b.png']);
    expect(mocks.forgetBackupReplicas).toHaveBeenNthCalledWith(2, ['private-media/a.png']);
  });

  it('does not erase the backup while deletion of its primary failed', async () => {
    primeDb({ mediaRows: [{ id: 'a', storage_pathname: 'private-media/a.png' }] });
    mocks.resolveObjectBackupTarget.mockReturnValue({
      store: {},
      bucket: 'backup',
      region: 'us-west-1',
      endpoint: 'https://backup',
    });
    mocks.deleteStoredMediaObjects.mockResolvedValue({
      deleted: 0,
      failedPathnames: ['private-media/a.png'],
    });

    const report = await eraseOrganizationData('org-1');

    expect(mocks.deleteBackupObject).not.toHaveBeenCalled();
    expect(report.complete).toBe(false);
    expect(report.tables['media_assets']).toEqual({ deleted: false, retainedForRetry: true });
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        String(sql).includes('delete from public.media_assets'),
      ),
    ).toBe(false);
  });

  it('retains the media row if backup target resolution throws after primary deletion', async () => {
    primeDb({ mediaRows: [{ id: 'a', storage_pathname: 'private-media/a.png' }] });
    mocks.resolveObjectBackupTarget.mockImplementationOnce(() => {
      throw new Error('invalid backup config');
    });

    await expect(eraseOrganizationData('org-1')).rejects.toThrow('invalid backup config');

    expect(
      mocks.query.mock.calls.some(([sql]) =>
        String(sql).includes('delete from public.media_assets'),
      ),
    ).toBe(false);
    expect(executedStatements().some((sql) => sql.startsWith('delete from'))).toBe(false);
  });

  it('does not start object or row disposal when the media inventory read fails', async () => {
    primeDb();
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('select id, storage_pathname from public.media_assets')) {
        throw new Error('inventory unavailable');
      }
      return query(sql);
    });

    await expect(eraseOrganizationData('org-1')).rejects.toThrow('inventory unavailable');

    expect(mocks.deleteStoredMediaObjects).not.toHaveBeenCalled();
    expect(mocks.deleteBackupObject).not.toHaveBeenCalled();
    expect(executedStatements().some((sql) => sql.startsWith('delete from'))).toBe(false);
  });

  it('preserves the existing zero-count policy when no backup target is configured', async () => {
    primeDb({ mediaRows: [{ id: 'a', storage_pathname: 'private-media/a.png' }] });
    const withoutTarget = await eraseOrganizationData('org-1');
    expect(withoutTarget.backupObjectsDeleted).toBe(0);
    expect(withoutTarget.backupObjectsFailed).toBe(0);
    expect(withoutTarget.complete).toBe(true);
  });

  it('settles an absent backup even if replica metadata cleanup fails', async () => {
    primeDb({ mediaRows: [{ id: 'a', storage_pathname: 'private-media/a.png' }] });
    mocks.resolveObjectBackupTarget.mockReturnValue({
      store: {},
      bucket: 'backup',
      region: 'us-west-1',
      endpoint: 'https://backup',
    });
    mocks.deleteBackupObject.mockResolvedValueOnce('absent');
    mocks.forgetBackupReplicas.mockRejectedValueOnce(new Error('tracking unavailable'));

    const withAbsentCopy = await eraseOrganizationData('org-1');
    expect(withAbsentCopy.backupObjectsDeleted).toBe(1);
    expect(withAbsentCopy.backupObjectsFailed).toBe(0);
    expect(withAbsentCopy.complete).toBe(true);
  });

  it.each([
    ['missing', 'The lockdown switch could not be prepared. Erasure did not start.'],
    ['read-error', 'flag read unavailable'],
    ['insert-error', 'flag insert unavailable'],
  ] as const)(
    'does not erase when the lockdown definition is %s',
    async (lockdownDefinition, message) => {
      primeDb({ lockdownDefinition });

      await expect(eraseOrganizationData('org-1')).rejects.toThrow(message);

      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.deleteStoredMediaObjects).not.toHaveBeenCalled();
      expect(mocks.invalidateActiveOrganizationCache).not.toHaveBeenCalled();
      expect(
        mocks.query.mock.calls.some(([sql]) =>
          /public\.(media_assets|organization_shared_connectors|organization_mcp_servers)/.test(
            String(sql),
          ),
        ),
      ).toBe(false);
    },
  );

  it('does not erase when writing the lockdown override fails', async () => {
    primeDb({ failStatementMatching: 'insert into public.feature_flags' });

    await expect(eraseOrganizationData('org-1')).rejects.toThrow('deadlock detected');

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(executedStatements()[0]).toContain('insert into public.feature_flags');
    expect(mocks.deleteStoredMediaObjects).not.toHaveBeenCalled();
    expect(mocks.invalidateActiveOrganizationCache).not.toHaveBeenCalled();
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        /public\.(media_assets|organization_shared_connectors|organization_mcp_servers)/.test(
          String(sql),
        ),
      ),
    ).toBe(false);
  });

  it('waits for the non-expiring workspace lock before deleting media or rows', async () => {
    primeDb({ mediaRows: [{ id: 'm1', storage_pathname: 'orgs/org-1/m1.png' }] });
    let finishLock!: (value: number) => void;
    let lockStarted!: () => void;
    const pendingLock = new Promise<number>((resolve) => {
      finishLock = resolve;
    });
    const started = new Promise<void>((resolve) => {
      lockStarted = resolve;
    });
    mocks.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('insert into public.feature_flags')) {
        lockStarted();
        return pendingLock;
      }
      return 1;
    });

    const pendingErasure = eraseOrganizationData('org-1');
    await started;
    try {
      expect(mocks.execute).toHaveBeenCalledTimes(1);
      expect(mocks.deleteStoredMediaObjects).not.toHaveBeenCalled();
      expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('media_assets'))).toBe(
        false,
      );
    } finally {
      finishLock(1);
    }

    await pendingErasure;

    expect(executedStatements()[0]).toContain('insert into public.feature_flags');
    expect(mocks.execute.mock.calls[0]?.[1]).toEqual([
      'org-1',
      'tenant.lockdown',
      false,
      'off',
      null,
    ]);
    expect(mocks.deleteStoredMediaObjects.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.execute.mock.invocationCallOrder[0]!,
    );
  });

  it('can establish the lock and complete on a later retry after an isolation failure', async () => {
    primeDb({ lockdownDefinition: 'missing' });
    await expect(eraseOrganizationData('org-1')).rejects.toThrow();

    primeDb();
    const report = await eraseOrganizationData('org-1');

    expect(report.complete).toBe(true);
    expect(report.organizationRetained).toBe(false);
    expect(
      mocks.execute.mock.calls.filter(([sql]) =>
        String(sql).includes('insert into public.feature_flags'),
      ),
    ).toHaveLength(1);
  });

  it('blocks the whole purge when an active legal hold exists, and touches nothing', async () => {
    primeDb({ underLegalHold: true });

    const report = await eraseOrganizationData('org-1');

    expect(report.complete).toBe(false);
    expect(report.blockedByLegalHold).toBe(true);
    expect(report.organizationRetained).toBe(true);
    expect(report.backupObjectsDeleted).toBe(0);
    expect(report.backupObjectsFailed).toBe(0);
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
    expect(statements.some((sql) => sql.includes('delete from public.feature_flags'))).toBe(false);
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

  it('detaches the stored-source ledger from the workspace instead of deleting it', async () => {
    primeDb();

    const report = await eraseOrganizationData('org-1');

    expect(report.anonymized['project_knowledge_objects']).toEqual({ updated: true });
    expect(report.tables['project_knowledge_objects']).toBeUndefined();
    const statements = executedStatements();
    expect(
      statements.some((sql) =>
        sql.includes(
          'update public.project_knowledge_objects set organization_id = null where organization_id = $1',
        ),
      ),
    ).toBe(true);
    expect(
      statements.some((sql) => sql.includes('delete from public.project_knowledge_objects')),
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
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('select id, storage_pathname from public.media_assets')) {
        return [
          { id: 'm1', storage_pathname: 'orgs/org-1/m1.png' },
          { id: 'm2', storage_pathname: 'orgs/org-1/m2.png' },
        ];
      }
      if (sql.includes('delete from public.media_assets where id = any')) {
        return [{ id: 'm1' }];
      }
      return query(sql);
    });

    const report = await eraseOrganizationData('org-1');

    expect(report.mediaObjectsDeleted).toBe(1);
    expect(report.mediaObjectsFailed).toBe(1);
    expect(report.mediaRowsDeleted).toBe(1);
    expect(report.complete).toBe(false);
    expect(report.organizationRetained).toBe(true);
    expect(
      executedStatements().some((sql) => sql.includes('delete from public.feature_flags')),
    ).toBe(false);
  });

  it.each([
    'delete from public.sso_connections',
    'update public.organization_usage_ledger',
    'delete from public.organizations where id = $1',
  ])('keeps flag cleanup deferred when %s fails', async (failStatementMatching) => {
    primeDb({ failStatementMatching });

    const report = await eraseOrganizationData('org-1');

    expect(report.complete).toBe(false);
    expect(report.organizationRetained).toBe(true);
    expect(
      executedStatements().some((sql) => sql.includes('delete from public.feature_flags')),
    ).toBe(false);
  });

  it('reestablishes the lock and reaches the final cascade on a retry after a partial purge', async () => {
    primeDb({ failStatementMatching: 'delete from public.sso_connections' });
    const first = await eraseOrganizationData('org-1');
    expect(first.complete).toBe(false);
    expect(first.organizationRetained).toBe(true);

    primeDb();
    const second = await eraseOrganizationData('org-1');

    expect(second.complete).toBe(true);
    expect(second.organizationRetained).toBe(false);
    expect(
      executedStatements().filter((sql) => sql.includes('insert into public.feature_flags')),
    ).toHaveLength(2);
    expect(
      executedStatements().some((sql) => sql.includes('delete from public.feature_flags')),
    ).toBe(false);
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
      executedStatements().some((sql) => sql.includes('delete from public.feature_flags')),
    ).toBe(false);
    expect(
      executedStatements().some((sql) =>
        sql.includes('delete from public.organizations where id = $1'),
      ),
    ).toBe(false);
  });

  it('cancels the seat subscription in Stripe before erasing anything', async () => {
    primeDb({ seatSubscriptionId: 'sub_seats1' });
    const order: string[] = [];
    mocks.cancelLiveStripeSubscriptionsNow.mockImplementation(async () => {
      order.push('stripe');
      return ['sub_seats1'];
    });
    mocks.execute.mockImplementation(async () => {
      order.push('erase');
      return 1;
    });

    const report = await eraseOrganizationData('org-1');

    expect(mocks.cancelLiveStripeSubscriptionsNow).toHaveBeenCalledWith({
      subscriptionReference: 'sub_seats1',
      customerReference: null,
    });
    expect(order[0]).toBe('stripe');
    expect(report.complete).toBe(true);
    expect(report.blockedByBilling).toBe(false);
  });

  it('keeps every row, including the billing linkage, when Stripe refuses the cancel', async () => {
    primeDb({ seatSubscriptionId: 'sub_seats1' });
    mocks.cancelLiveStripeSubscriptionsNow.mockRejectedValue(new Error('stripe unavailable'));

    const report = await eraseOrganizationData('org-1');

    expect(report.complete).toBe(false);
    expect(report.blockedByBilling).toBe(true);
    expect(report.organizationRetained).toBe(true);
    expect(report.backupObjectsDeleted).toBe(0);
    expect(report.backupObjectsFailed).toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.deleteStoredMediaObjects).not.toHaveBeenCalled();
  });

  it('does not call Stripe for a workspace without a seat subscription', async () => {
    primeDb();

    await eraseOrganizationData('org-1');

    expect(mocks.cancelLiveStripeSubscriptionsNow).not.toHaveBeenCalled();
  });

  it('does not cancel billing for a workspace under a legal hold', async () => {
    primeDb({ underLegalHold: true, seatSubscriptionId: 'sub_seats1' });

    await eraseOrganizationData('org-1');

    expect(mocks.cancelLiveStripeSubscriptionsNow).not.toHaveBeenCalled();
  });
});

type ImportedModule1 = typeof import('@/lib/server/payments/stripe-provider');
type ImportedModule0 = typeof import('@/lib/server/object-backup');
