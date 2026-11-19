type OriginalObjectStorageModule = typeof import('@/lib/server/object-storage');
type OriginalProjectKnowledgeObjectStorageModule =
  typeof import('@/lib/server/project-knowledge-object-storage');
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  deleteStoredMediaObjects: vi.fn(),
  deleteObject: vi.fn(),
  deletePrivateObject: vi.fn(),
  privateObjectStorageConfigured: vi.fn(() => true),
  objectStorageConfigured: vi.fn(() => true),
  objectKeyFromStorageUri: vi.fn((value: string): string | null => value),
  deleteE2BSessionsForUser: vi.fn(),
  resolveObjectBackupTarget: vi.fn(
    (): { store: unknown; bucket: string; region: string; endpoint: string } | null => null,
  ),
  deleteBackupObject: vi.fn(async (_key: string, _options?: unknown) => 'deleted'),
  forgetBackupReplicas: vi.fn(async (_keys: readonly string[]) => 0),
  revokeAllConnectorTokensAtProviders: vi.fn(async (_userId: string) => ({
    attempted: 0,
    revoked: 0,
  })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  withCorsAndSecurityHeaders: vi.fn((response: unknown) => response),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        query: (...args: unknown[]) => mocks.query(...args),
        execute: (...args: unknown[]) => mocks.execute(...args),
      }),
  })),
}));
vi.mock('@/lib/server/media-storage', () => ({
  deleteStoredMediaObjects: (...args: unknown[]) => mocks.deleteStoredMediaObjects(...args),
  extForMime: vi.fn(),
  streamStoredMedia: vi.fn(),
}));
vi.mock('@/lib/server/object-storage', async (importOriginal) => ({
  ...(await importOriginal<OriginalObjectStorageModule>()),
  createPrivateObjectWriter: vi.fn(),
  createObjectCleanupPlan: vi.fn(),
  copyPrivateObjectIfUnchanged: vi.fn(),
  deleteObject: (...args: unknown[]) => mocks.deleteObject(...args),
  isObjectStorageConfigured: () => mocks.objectStorageConfigured(),
  objectKeyFromPublicUrl: (value: string) =>
    value.startsWith('https://cdn/') ? value.slice(12) : null,
  objectKeyFromStorageUri: (value: string) => mocks.objectKeyFromStorageUri(value),
  StoredObjectTooLargeError: class StoredObjectTooLargeError extends Error {},
  deletePrivateObject: (...args: unknown[]) => mocks.deletePrivateObject(...args),
  getBoundedObject: vi.fn(),
  getBoundedPrivateObject: vi.fn(),
  getObject: vi.fn(),
  getObjectStream: vi.fn(),
  getPrivateObject: vi.fn(),
  getPrivateObjectStream: vi.fn(),
  isPrivateObjectStorageConfigured: () => mocks.privateObjectStorageConfigured(),
  putPrivateObject: vi.fn(),
}));
vi.mock('@/lib/server/project-knowledge-object-storage', async (importOriginal) => ({
  ...(await importOriginal<OriginalProjectKnowledgeObjectStorageModule>()),
  deleteProjectKnowledgeObject: (...args: unknown[]) => mocks.deleteObject(...args),
  isProjectKnowledgeObjectStorageConfigured: () => mocks.objectStorageConfigured(),
  getProjectKnowledgeObject: vi.fn(),
}));
vi.mock('@/lib/e2b/session-store', () => ({
  deleteE2BSessionsForUser: (...args: unknown[]) => mocks.deleteE2BSessionsForUser(...args),
}));
vi.mock('@/lib/connectors/oauth-access', () => ({
  revokeAllConnectorTokensAtProviders: (userId: string) =>
    mocks.revokeAllConnectorTokensAtProviders(userId),
}));
vi.mock('@/lib/server/object-backup', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  resolveObjectBackupTarget: () => mocks.resolveObjectBackupTarget(),
  deleteBackupObject: (key: string, options?: unknown) => mocks.deleteBackupObject(key, options),
  forgetBackupReplicas: (keys: readonly string[]) => mocks.forgetBackupReplicas(keys),
}));

process.env['JWT_SECRET'] = 'test-developer-jwt-secret-at-least-32-bytes';

import {
  ANONYMIZED_USER_COLUMNS,
  EMAIL_SCOPED_USER_TABLES,
  FINANCIAL_ERASURE_DISPOSITION,
  UNDELETED_USER_TABLES,
  USER_SCOPED_TABLES,
  eraseUserAccountData,
} from './account-erasure';
import {
  FINANCIAL_RETENTION_RULES,
  FINANCIAL_TABLES_WITHOUT_MAXIMUM_AGE,
} from '@/lib/billing/financial-record-retention';
import { POST as refreshDeviceSession } from '@/app/api/auth/device/refresh/route';
import { CURRENT_TERMS_VERSION } from '@/lib/server/terms';
import { DATA_EXPORT_BUILD_ARCHIVE_JOB } from '@/lib/server/data-export-archive';

const SCOPE_COLUMNS = new Set([
  'user_id',
  'owner_id',
  'owner_user_id',
  'actor',
  'actor_user_id',
  'account_id',
  'created_by',
  'added_by_user_id',
  'granted_by_user_id',
  'agent_user_id',
  'escalated_by_user_id',
  'referrer_id',
  'referred_user_id',
  'target_owner_id',
]);

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

function userScopedSchemaTables(): Map<string, Set<string>> {
  const scoped = new Map<string, Set<string>>();
  for (const [table, columns] of schemaColumnsByTable()) {
    const hits = new Set([...columns].filter((column) => SCOPE_COLUMNS.has(column)));
    if (hits.size > 0) scoped.set(table, hits);
  }
  return scoped;
}

interface ErasureFixture {
  mediaRows?: Array<{ id: string; storage_pathname: string | null }>;
  knowledgeRows?: Array<{ storage_uri: string | null }>;
  untrackedLedgerKeys?: string[];
  unsettledLedgerRows?: number;
  avatarUrl?: string | null;
  feedbackScreenshotKeys?: Array<string | null>;
  failStatementMatching?: string;
  activeVideoJobs?: boolean;
  activeImageJobs?: boolean;
  pendingVideoIncident?: boolean;
  pendingVideoSettlement?: boolean;
  videoGateError?: Error;
  missingProfileFence?: boolean;
  liveDataFence?: boolean;
  underLegalHold?: boolean;
  legalHoldError?: Error;
}

function primeDb(fixture: ErasureFixture = {}): void {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('public.legal_holds')) {
      if (fixture.legalHoldError) throw fixture.legalHoldError;
      return [{ held: fixture.underLegalHold ?? false }];
    }
    if (sql.includes('update public.profiles') && sql.includes('deletion_requested_at')) {
      return fixture.missingProfileFence || fixture.liveDataFence ? [] : [{ id: 'user-1' }];
    }
    if (
      sql.includes('update public.profiles') &&
      sql.includes('video_generation_erasure_fence_token')
    ) {
      return fixture.missingProfileFence ? [] : [{ id: 'user-1' }];
    }
    if (sql.includes('as video_blocking')) {
      if (fixture.videoGateError) throw fixture.videoGateError;
      return [
        {
          video_blocking:
            (fixture.activeVideoJobs ?? false) ||
            (fixture.pendingVideoIncident ?? false) ||
            (fixture.pendingVideoSettlement ?? false),
          image_blocking: fixture.activeImageJobs ?? false,
        },
      ];
    }
    if (sql.includes('media_assets')) return fixture.mediaRows ?? [];
    if (sql.includes('from public.project_knowledge_objects ledger')) {
      return (fixture.untrackedLedgerKeys ?? []).map((object_key) => ({ object_key }));
    }
    if (sql.includes('as unsettled')) return [{ unsettled: fixture.unsettledLedgerRows ?? 0 }];
    if (sql.includes('project_knowledge_files')) return fixture.knowledgeRows ?? [];
    if (sql.includes('avatar_url')) return [{ avatar_url: fixture.avatarUrl ?? null }];
    if (sql.includes("metadata->>'screenshot_key'")) {
      return (fixture.feedbackScreenshotKeys ?? []).map((screenshot_key) => ({ screenshot_key }));
    }
    return [];
  });
  mocks.execute.mockImplementation(async (sql: string) => {
    if (fixture.failStatementMatching && sql.includes(fixture.failStatementMatching)) {
      throw new Error('deadlock detected');
    }
    return 1;
  });
}

function executedStatements(): string[] {
  return mocks.execute.mock.calls.map((call) => String(call[0]).replace(/\s+/gu, ' ').trim());
}

describe('account erasure inventory', () => {
  it('classifies every user-scoped table in the schema', () => {
    const scoped = userScopedSchemaTables();
    const deleted = new Set(
      [...USER_SCOPED_TABLES, ...EMAIL_SCOPED_USER_TABLES].map((entry) => entry.table),
    );
    const anonymized = new Set(ANONYMIZED_USER_COLUMNS.map((entry) => entry.table));
    const undeleted = new Set(Object.keys(UNDELETED_USER_TABLES));

    expect(scoped.size).toBeGreaterThan(50);

    const unclassified = [...scoped.keys()]
      .filter((table) => !deleted.has(table) && !anonymized.has(table) && !undeleted.has(table))
      .sort();
    expect(unclassified).toEqual([]);
  });

  it('gives each table one disposition, by a column that exists', () => {
    const schema = schemaColumnsByTable();
    const dispositions = [
      {
        name: 'deleted',
        entries: [...USER_SCOPED_TABLES, ...EMAIL_SCOPED_USER_TABLES] as ReadonlyArray<{
          table: string;
          column: string;
          alsoColumn?: string;
        }>,
      },
      {
        name: 'anonymized',
        entries: ANONYMIZED_USER_COLUMNS as ReadonlyArray<{
          table: string;
          column: string;
          alsoColumn?: string;
        }>,
      },
    ];

    const seen = new Map<string, string>();
    for (const { name, entries } of dispositions) {
      for (const entry of entries) {
        const { table, column } = entry;
        const previous = seen.get(table);
        expect(previous ?? name, `${table} is both ${previous} and ${name}`).toBe(name);
        seen.set(table, name);
        for (const named of [column, 'alsoColumn' in entry ? entry.alsoColumn : undefined]) {
          if (named === undefined) continue;
          expect(schema.get(table)?.has(named), `${table}.${named} does not exist`).toBe(true);
        }
      }
    }
    for (const table of Object.keys(UNDELETED_USER_TABLES)) {
      expect(seen.get(table), `${table} is retained and also erased`).toBe(undefined);
      expect(schema.has(table), `${table} is retained and no live migration creates it`).toBe(true);
    }
  });

  it('deletes the profile row last', () => {
    expect(USER_SCOPED_TABLES.at(-1)).toEqual({ table: 'profiles', column: 'id' });
  });

  it('deletes account-owned plugin and native-store state rather than retaining it', () => {
    const deleted = new Set(USER_SCOPED_TABLES.map((entry) => entry.table));
    const retained = new Set(Object.keys(UNDELETED_USER_TABLES));
    const anonymized = new Set(ANONYMIZED_USER_COLUMNS.map((entry) => entry.table));

    for (const table of [
      'plugin_installations',
      'mobile_iap_transactions',
      'mobile_iap_accounts',
    ]) {
      expect(deleted.has(table), `${table} must be erased with its owning account`).toBe(true);
      expect(retained.has(table), `${table} must not survive account erasure`).toBe(false);
      expect(anonymized.has(table), `${table} is not shared with another owner`).toBe(false);
    }
  });

  it('deletes personal voice and automation records while preserving shared audit provenance', () => {
    const deleted = new Set(USER_SCOPED_TABLES.map((entry) => entry.table));
    const retained = new Set(Object.keys(UNDELETED_USER_TABLES));

    expect(deleted.has('voice_sessions')).toBe(true);
    expect(deleted.has('automation_audit_events')).toBe(true);
    expect(retained.has('cloud_agent_run_budgets')).toBe(true);
    expect(retained.has('legal_hold_custodians')).toBe(true);
    expect(retained.has('plugin_registry_lifecycle_events')).toBe(true);
  });

  it('classifies every financial table the retention schedule names', () => {
    const scoped = userScopedSchemaTables();
    const classified = new Set([
      ...USER_SCOPED_TABLES.map((entry) => entry.table),
      ...ANONYMIZED_USER_COLUMNS.map((entry) => entry.table),
      ...Object.keys(UNDELETED_USER_TABLES),
    ]);

    const financial = new Set([
      ...FINANCIAL_RETENTION_RULES.map((rule) => rule.table),
      ...FINANCIAL_TABLES_WITHOUT_MAXIMUM_AGE.map((entry) => entry.table),
    ]);

    const unclassified = [...financial]
      .filter((table) => scoped.has(table) && !classified.has(table))
      .sort();
    expect(unclassified).toEqual([]);
  });

  it("deletes the subject's own credit ledger and keeps the platform's cost ledger", () => {
    const deleted = new Set(USER_SCOPED_TABLES.map((entry) => entry.table));
    const anonymized = new Set(ANONYMIZED_USER_COLUMNS.map((entry) => entry.table));

    for (const table of Object.keys(FINANCIAL_ERASURE_DISPOSITION)) {
      expect(deleted.has(table), `${table} must go with the subject`).toBe(true);
      expect(anonymized.has(table), `${table} has no anonymized form to keep`).toBe(false);
      expect(FINANCIAL_ERASURE_DISPOSITION[table]!.length).toBeGreaterThan(40);
    }

    for (const table of ['provider_cost_events', 'cogs_adjustments', 'organization_usage_ledger']) {
      expect(anonymized.has(table), `${table} is the platform's record, not the subject's`).toBe(
        true,
      );
      expect(deleted.has(table)).toBe(false);
    }

    expect(Object.keys(FINANCIAL_ERASURE_DISPOSITION).sort()).toEqual([
      'credit_transactions',
      'subscriptions',
      'token_credits',
    ]);
  });
});

describe('eraseUserAccountData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.objectStorageConfigured.mockReturnValue(true);
    mocks.objectKeyFromStorageUri.mockReset();
    mocks.objectKeyFromStorageUri.mockImplementation((value: string) => value);
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.deletePrivateObject.mockResolvedValue(undefined);
    mocks.privateObjectStorageConfigured.mockReturnValue(true);
    mocks.deleteStoredMediaObjects.mockResolvedValue({ deleted: 0, failedPathnames: [] });
    mocks.deleteE2BSessionsForUser.mockResolvedValue({ deleted: 0, failed: 0, reachable: true });
    mocks.resolveObjectBackupTarget.mockReset();
    mocks.resolveObjectBackupTarget.mockReturnValue(null);
    mocks.deleteBackupObject.mockReset();
    mocks.deleteBackupObject.mockResolvedValue('deleted');
    mocks.forgetBackupReplicas.mockReset();
    mocks.forgetBackupReplicas.mockResolvedValue(0);
  });

  it('keeps failed export pointers for the next erasure while deleting unrelated user jobs', async () => {
    primeDb();
    let jobs = [
      {
        userId: 'user-1',
        kind: DATA_EXPORT_BUILD_ARCHIVE_JOB,
        payload: { exportId: 'export-1', volume: 1 },
      },
      { userId: 'user-1', kind: 'email.data-export-ready', payload: {} },
      {
        userId: 'user-2',
        kind: DATA_EXPORT_BUILD_ARCHIVE_JOB,
        payload: { exportId: 'export-2', volume: 1 },
      },
      { userId: null, kind: 'data-export.expire-archive', payload: { ownerId: 'user-1' } },
    ];
    const query = mocks.query.getMockImplementation()!;
    const execute = mocks.execute.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('select payload') && sql.includes('from public.background_jobs')) {
        return jobs.filter((job) => job.userId === params[0] && job.kind === params[1]);
      }
      return query(sql);
    });
    mocks.execute.mockImplementation(async (sql: string, params: unknown[]) => {
      const result = await execute(sql);
      if (sql.includes('delete from public.background_jobs')) {
        jobs = jobs.filter(
          (job) =>
            job.userId !== params[0] || (sql.includes('kind <> $2') && job.kind === params[1]),
        );
      }
      return result;
    });
    mocks.deletePrivateObject.mockRejectedValueOnce(new Error('storage unavailable'));

    const first = await eraseUserAccountData('user-1');

    expect(first.exportObjectsFailed).toBe(1);
    expect(first.complete).toBe(false);
    expect(first.profileRetained).toBe(true);
    expect(first.tables['background_jobs']).toEqual({ deleted: false, retainedForRetry: true });
    expect(jobs.map(({ userId, kind }) => ({ userId, kind }))).toEqual([
      { userId: 'user-1', kind: DATA_EXPORT_BUILD_ARCHIVE_JOB },
      { userId: 'user-2', kind: DATA_EXPORT_BUILD_ARCHIVE_JOB },
      { userId: null, kind: 'data-export.expire-archive' },
    ]);

    const second = await eraseUserAccountData('user-1');

    expect(second.exportObjectsFailed).toBe(0);
    expect(second.complete).toBe(true);
    expect(second.profileRetained).toBe(false);
    expect(second.tables['background_jobs']).toEqual({ deleted: true });
    expect(jobs.map(({ userId }) => userId)).toEqual(['user-2', null]);
    expect(mocks.deletePrivateObject.mock.calls.map(([key]) => key)).toEqual([
      'exports/user-1/export-1/export.json',
      'exports/user-1/export-1/agi-export-part-1.zip',
      'exports/user-1/export-1/export.json',
      'exports/user-1/export-1/agi-export-part-1.zip',
    ]);
  });

  it('purges the sandbox cache for the subject instead of waiting out its TTL', async () => {
    primeDb({});
    mocks.deleteE2BSessionsForUser.mockResolvedValue({ deleted: 3, failed: 0, reachable: true });

    const report = await eraseUserAccountData('user-1');

    expect(mocks.deleteE2BSessionsForUser).toHaveBeenCalledWith('user-1');
    expect(report.cacheKeysDeleted).toBe(3);
    expect(report.cacheKeysFailed).toBe(0);
    expect(report.complete).toBe(true);
  });

  it("deletes the subject's credit ledger while anonymizing the platform's cost rows", async () => {
    primeDb({});

    await eraseUserAccountData('user-1');

    const statements = executedStatements();
    for (const table of Object.keys(FINANCIAL_ERASURE_DISPOSITION)) {
      expect(statements).toContain(`delete from public.${table} where user_id = $1`);
      expect(
        statements.some((sql) => sql.includes(`update public.${table} set user_id = null`)),
      ).toBe(false);
    }
    expect(statements).toContain(
      'update public.provider_cost_events set user_id = null where user_id = $1',
    );
    expect(statements).toContain(
      'update public.cogs_adjustments set user_id = null where user_id = $1',
    );
    expect(statements).toContain(
      'delete from public.organization_usage_ledger where user_id = $1 and organization_id is null',
    );
    expect(statements).toContain(
      'update public.organization_usage_ledger set user_id = null where user_id = $1 and organization_id is not null',
    );
    expect(statements).not.toContain(
      'update public.organization_usage_ledger set user_id = null where user_id = $1',
    );
  });

  it('removes the backup copy of every object it erased from the primary', async () => {
    primeDb({
      mediaRows: [
        { id: '11111111-1111-4111-8111-111111111111', storage_pathname: 'private-media/a.png' },
        { id: '22222222-2222-4222-8222-222222222222', storage_pathname: 'private-media/b.png' },
      ],
    });
    mocks.deleteStoredMediaObjects.mockResolvedValue({ deleted: 2, failedPathnames: [] });
    mocks.resolveObjectBackupTarget.mockReturnValue({
      store: {},
      bucket: 'agi-backup',
      region: 'us-west-1',
      endpoint: 'https://backup',
    });

    const report = await eraseUserAccountData('user-1');

    expect(mocks.deleteBackupObject).toHaveBeenCalledTimes(2);
    expect(mocks.deleteBackupObject).toHaveBeenCalledWith(
      'private-media/a.png',
      expect.objectContaining({ target: expect.objectContaining({ bucket: 'agi-backup' }) }),
    );
    expect(mocks.forgetBackupReplicas).toHaveBeenCalledWith([
      'private-media/a.png',
      'private-media/b.png',
    ]);
    expect(report.backupObjectsDeleted).toBe(2);
    expect(report.backupObjectsFailed).toBe(0);
  });

  it('leaves the backup copy of an object the primary still holds', async () => {
    primeDb({
      mediaRows: [
        { id: '11111111-1111-4111-8111-111111111111', storage_pathname: 'private-media/a.png' },
      ],
    });
    mocks.deleteStoredMediaObjects.mockResolvedValue({
      deleted: 0,
      failedPathnames: ['private-media/a.png'],
    });
    mocks.resolveObjectBackupTarget.mockReturnValue({
      store: {},
      bucket: 'agi-backup',
      region: 'us-west-1',
      endpoint: 'https://backup',
    });

    await eraseUserAccountData('user-1');

    expect(mocks.deleteBackupObject).not.toHaveBeenCalled();
  });

  it('keeps the account and the media row open for retry when a backup copy survived', async () => {
    primeDb({
      mediaRows: [
        { id: '11111111-1111-4111-8111-111111111111', storage_pathname: 'private-media/a.png' },
        { id: '22222222-2222-4222-8222-222222222222', storage_pathname: 'private-media/b.png' },
      ],
    });
    mocks.deleteStoredMediaObjects.mockResolvedValue({ deleted: 2, failedPathnames: [] });
    mocks.resolveObjectBackupTarget.mockReturnValue({
      store: {},
      bucket: 'agi-backup',
      region: 'us-west-1',
      endpoint: 'https://backup',
    });
    mocks.deleteBackupObject.mockRejectedValueOnce(new Error('backup bucket unavailable'));

    const report = await eraseUserAccountData('user-1');

    expect(report.backupObjectsFailed).toBe(1);
    expect(report.complete).toBe(false);
    expect(report.profileRetained).toBe(true);
    const rowDelete = mocks.query.mock.calls.find((call) =>
      String(call[0]).includes('delete from public.media_assets'),
    );
    expect(rowDelete?.[1]).toEqual([['22222222-2222-4222-8222-222222222222']]);
  });

  it('keeps the account open for retry when cached sandbox state survived', async () => {
    primeDb({});
    mocks.deleteE2BSessionsForUser.mockResolvedValue({ deleted: 0, failed: 2, reachable: true });

    const report = await eraseUserAccountData('user-1');

    expect(report.cacheKeysFailed).toBe(2);
    expect(report.complete).toBe(false);
    expect(report.profileRetained).toBe(true);
  });

  it('revokes connector tokens upstream before it deletes the grant rows', async () => {
    primeDb({});
    let revokedBeforeGrantDelete = false;
    mocks.revokeAllConnectorTokensAtProviders.mockImplementation(async () => {
      revokedBeforeGrantDelete = !executedStatements().some((sql) =>
        sql.includes('delete from public.connector_oauth_grants'),
      );
      return { attempted: 1, revoked: 1 };
    });

    const report = await eraseUserAccountData('user-1');

    expect(mocks.revokeAllConnectorTokensAtProviders).toHaveBeenCalledWith('user-1');
    expect(revokedBeforeGrantDelete).toBe(true);
    expect(report.complete).toBe(true);
  });

  it('still erases the grants when upstream revocation fails', async () => {
    primeDb({});
    mocks.revokeAllConnectorTokensAtProviders.mockRejectedValue(new Error('provider down'));

    const report = await eraseUserAccountData('user-1');

    expect(
      executedStatements().some((sql) =>
        sql.includes('delete from public.connector_oauth_grants where user_id = $1'),
      ),
    ).toBe(true);
    expect(report.complete).toBe(true);
  });

  it('deletes the screenshots a person attached to feedback from private storage', async () => {
    primeDb({
      feedbackScreenshotKeys: ['feedback/user-1/1_a.png', null, 'feedback/user-1/2_b.webp'],
    });

    const report = await eraseUserAccountData('user-1');

    expect(mocks.deletePrivateObject.mock.calls.map((call) => call[0])).toEqual([
      'feedback/user-1/1_a.png',
      'feedback/user-1/2_b.webp',
    ]);
    expect(mocks.deleteObject).not.toHaveBeenCalledWith('feedback/user-1/1_a.png');
    expect(report.feedbackObjectsDeleted).toBe(2);
    expect(report.feedbackObjectsFailed).toBe(0);
    expect(report.tables['feedback']?.deleted).toBe(true);
    expect(report.complete).toBe(true);
  });

  it('keeps the feedback rows, and the account, while a screenshot is still stored', async () => {
    primeDb({ feedbackScreenshotKeys: ['feedback/user-1/1_a.png'] });
    mocks.deletePrivateObject.mockRejectedValueOnce(new Error('storage unavailable'));

    const report = await eraseUserAccountData('user-1');

    expect(report.feedbackObjectsFailed).toBe(1);
    expect(report.tables['feedback']).toEqual({ deleted: false, retainedForRetry: true });
    expect(
      executedStatements().some((sql) => sql.includes('delete from public.feedback where')),
    ).toBe(false);
    expect(report.complete).toBe(false);
    expect(report.profileRetained).toBe(true);
  });

  it('retains the feedback rows when private storage is not configured to delete from', async () => {
    primeDb({ feedbackScreenshotKeys: ['feedback/user-1/1_a.png'] });
    mocks.privateObjectStorageConfigured.mockReturnValueOnce(false);

    const report = await eraseUserAccountData('user-1');

    expect(mocks.deletePrivateObject).not.toHaveBeenCalled();
    expect(report.feedbackObjectsFailed).toBe(1);
    expect(report.complete).toBe(false);
  });

  it('finds an unregistered screenshot through its cleanup record as well as through a report', async () => {
    primeDb({ feedbackScreenshotKeys: ['feedback/user-1/3_orphan.png'] });

    await eraseUserAccountData('user-1');

    const lookup = mocks.query.mock.calls
      .map((call) => String(call[0]).replace(/\s+/gu, ' '))
      .find((sql) => sql.includes("metadata->>'screenshot_key'"));
    expect(lookup).toContain('union select storage_key as screenshot_key');
    expect(lookup).toContain('from public.feedback_screenshot_cleanups where user_id = $1');
    expect(mocks.deletePrivateObject).toHaveBeenCalledWith('feedback/user-1/3_orphan.png');
    expect(executedStatements()).toContain(
      'delete from public.feedback_screenshot_cleanups where user_id = $1',
    );
  });

  it('keeps the cleanup records while a screenshot is still stored, so the next run finds it', async () => {
    primeDb({ feedbackScreenshotKeys: ['feedback/user-1/3_orphan.png'] });
    mocks.deletePrivateObject.mockRejectedValueOnce(new Error('storage unavailable'));

    const report = await eraseUserAccountData('user-1');

    expect(report.tables['feedback_screenshot_cleanups']).toEqual({
      deleted: false,
      retainedForRetry: true,
    });
    expect(
      executedStatements().some((sql) =>
        sql.includes('delete from public.feedback_screenshot_cleanups'),
      ),
    ).toBe(false);
    expect(report.complete).toBe(false);
  });

  it('erases the relay pairings that name the account in their metadata', async () => {
    primeDb({});

    const report = await eraseUserAccountData('user-1');

    expect(
      executedStatements().some((sql) =>
        sql.includes("delete from public.signaling_sessions where metadata ->> 'userId' = $1"),
      ),
    ).toBe(true);
    expect(report.tables['signaling_sessions']).toEqual({ deleted: true });
  });

  it('erases every listed table, anonymizes shared rows, and removes the profile last', async () => {
    primeDb({
      knowledgeRows: [{ storage_uri: 'knowledge/doc.pdf' }],
      avatarUrl: 'https://cdn/av.png',
    });

    const report = await eraseUserAccountData('user-1');

    expect(report.complete).toBe(true);
    expect(report.profileRetained).toBe(false);
    expect(mocks.deleteObject).toHaveBeenCalledWith('knowledge/doc.pdf');
    expect(mocks.deleteObject).toHaveBeenCalledWith('av.png');

    const statements = executedStatements();
    for (const { table, column, alsoColumn, jsonKey } of USER_SCOPED_TABLES) {
      const target = jsonKey === undefined ? column : `${column} ->> '${jsonKey}'`;
      const subject =
        alsoColumn === undefined ? `${target} = $1` : `(${target} = $1 or ${alsoColumn} = $1)`;
      expect(
        statements.some((sql) => sql.includes(`delete from public.${table} where ${subject}`)),
        `${table}.${column} still names an account that no longer exists`,
      ).toBe(true);
    }
    expect(
      statements.some((sql) => sql.includes('delete from public.user_skills where user_id = $1')),
    ).toBe(true);
    for (const { table, column } of EMAIL_SCOPED_USER_TABLES) {
      expect(
        statements.some(
          (sql) =>
            sql.startsWith(`delete from public.${table} where lower(${column}) in`) &&
            sql.includes('select lower(email) from public.profiles where id = $1'),
        ),
        `${table} keeps the address of an account that no longer exists`,
      ).toBe(true);
      expect(report.tables[table]?.deleted).toBe(true);
    }
    for (const { table, column } of ANONYMIZED_USER_COLUMNS) {
      if (table === 'organization_usage_ledger') {
        expect(
          statements.some((sql) =>
            sql.includes(
              'update public.organization_usage_ledger set user_id = null where user_id = $1 and organization_id is not null',
            ),
          ),
        ).toBe(true);
        continue;
      }
      expect(
        statements.some((sql) => sql.includes(`update public.${table} set ${column} = null`)),
      ).toBe(true);
    }
    expect(statements.at(-1)).toContain('delete from public.profiles');
  });

  it('touches no bytes, jobs, billing, or profile while a provider video is active', async () => {
    primeDb({ activeVideoJobs: true, mediaRows: [{ id: 'asset-1', storage_pathname: 'video' }] });

    const report = await eraseUserAccountData('user-1');

    expect(report.complete).toBe(false);
    expect(report.profileRetained).toBe(true);
    expect(report.tables['video_generation_jobs']).toEqual({
      deleted: false,
      retainedForRetry: true,
    });
    expect(mocks.deleteStoredMediaObjects).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('touches nothing while an image job is still queued or still owes a settlement', async () => {
    primeDb({ activeImageJobs: true, mediaRows: [{ id: 'asset-1', storage_pathname: 'image' }] });

    const report = await eraseUserAccountData('user-1');

    expect(report.complete).toBe(false);
    expect(report.profileRetained).toBe(true);
    expect(report.tables['image_generation_jobs']).toEqual({
      deleted: false,
      retainedForRetry: true,
    });
    expect(report.tables['video_generation_jobs']).toBeUndefined();
    expect(mocks.deleteStoredMediaObjects).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('asks about image jobs by their own status and settlement columns', async () => {
    primeDb({});

    await eraseUserAccountData('user-1');

    const gate = mocks.query.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.includes('as image_blocking'));
    expect(gate).toContain('from public.image_generation_jobs');
    expect(gate).toMatch(/status in \('queued', 'processing'\)/);
    expect(gate).toContain("billing_settlement_status = 'pending'");
  });

  it('deletes terminal image rows before their managed-usage parent', async () => {
    primeDb({});

    const report = await eraseUserAccountData('user-1');

    expect(report.complete).toBe(true);
    const statements = executedStatements();
    const imageIndex = statements.findIndex((sql) =>
      sql.includes('delete from public.image_generation_jobs'),
    );
    const managedIndex = statements.findIndex((sql) =>
      sql.includes('delete from public.managed_usage_requests'),
    );
    expect(imageIndex).toBeGreaterThanOrEqual(0);
    expect(imageIndex).toBeLessThan(managedIndex);
  });

  it('never converts a data-only erasure blocked by video into an account purge', async () => {
    primeDb({ activeVideoJobs: true });

    const report = await eraseUserAccountData('user-1', {
      retainProfile: true,
      scope: 'data',
    });

    expect(report.complete).toBe(false);
    const queries = mocks.query.mock.calls.map((call) => String(call[0]));
    expect(queries.some((sql) => /set deletion_scheduled_for/iu.test(sql))).toBe(false);
    expect(queries.some((sql) => sql.includes('video_generation_erasure_fence_expires_at'))).toBe(
      true,
    );
    expect(
      executedStatements().some(
        (sql) =>
          sql.includes('video_generation_erasure_fence_token = null') &&
          !sql.includes('deletion_scheduled_for'),
      ),
    ).toBe(true);
  });

  it('fails closed without deleting anything when active-video state cannot be proved', async () => {
    primeDb({ videoGateError: new Error('Neon unavailable') });

    const report = await eraseUserAccountData('user-1');

    expect(report.complete).toBe(false);
    expect(report.tables['video_generation_jobs']?.error).toContain('Neon unavailable');
    expect(mocks.deleteStoredMediaObjects).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('fails closed when the profile deletion fence matches no row', async () => {
    primeDb({ missingProfileFence: true });

    const report = await eraseUserAccountData('user-1');

    expect(report.complete).toBe(false);
    expect(report.tables['video_generation_jobs']?.error).toContain('matched no account row');
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('retains a terminal video incident until its owed human alert is delivered', async () => {
    primeDb({ pendingVideoIncident: true });

    const report = await eraseUserAccountData('user-1');

    expect(report.complete).toBe(false);
    expect(report.tables['video_generation_jobs']?.retainedForRetry).toBe(true);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('deletes nothing while a video final credit settlement is still pending', async () => {
    primeDb({ pendingVideoSettlement: true });

    const accountReport = await eraseUserAccountData('user-1');
    expect(accountReport.complete).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();

    vi.clearAllMocks();
    primeDb({ pendingVideoSettlement: true });
    const dataReport = await eraseUserAccountData('user-1', {
      retainProfile: true,
      scope: 'data',
    });
    expect(dataReport.complete).toBe(false);
    const nonFenceStatements = executedStatements().filter(
      (sql) => !sql.includes('video_generation_erasure_fence_token = null'),
    );
    expect(nonFenceStatements).toEqual([]);
    expect(
      executedStatements().every((sql) =>
        sql.includes('video_generation_erasure_fence_token = null'),
      ),
    ).toBe(true);

    const blockerSql = mocks.query.mock.calls.map((call) => String(call[0])).join('\n');
    expect(blockerSql).toMatch(/final_settlement_status = 'pending'/i);
    expect(blockerSql).toMatch(
      /credit_settlement_jobs[\s\S]*settlement\.status = 'pending'[\s\S]*\{usage,operation\}' = 'video'/i,
    );
  });

  it('does not let account erasure race a live data-only erasure fence', async () => {
    primeDb({ liveDataFence: true });

    const report = await eraseUserAccountData('user-1');

    expect(report.complete).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
    const accountFenceSql = mocks.query.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.includes('set deletion_requested_at'));
    expect(accountFenceSql).toMatch(
      /video_generation_erasure_fence_token is null[\s\S]*video_generation_erasure_fence_expires_at <= now\(\)/i,
    );
  });

  it('commits the profile deletion fence before checking active jobs or media', async () => {
    primeDb({ activeVideoJobs: true });

    await eraseUserAccountData('user-1');

    const queries = mocks.query.mock.calls.map((call) => String(call[0]));
    const fenceIndex = queries.findIndex(
      (sql) => sql.includes('update public.profiles') && sql.includes('deletion_requested_at'),
    );
    const activeIndex = queries.findIndex((sql) =>
      sql.includes('from public.video_generation_jobs'),
    );
    expect(fenceIndex).toBeGreaterThanOrEqual(0);
    expect(fenceIndex).toBeLessThan(activeIndex);
  });

  it('deletes terminal video rows before their managed-usage parent', async () => {
    primeDb({ activeVideoJobs: false });

    const report = await eraseUserAccountData('user-1');

    expect(report.complete).toBe(true);
    const statements = executedStatements();
    const videoIndex = statements.findIndex((sql) =>
      sql.includes('delete from public.video_generation_jobs'),
    );
    const managedIndex = statements.findIndex((sql) =>
      sql.includes('delete from public.managed_usage_requests'),
    );
    expect(videoIndex).toBeGreaterThanOrEqual(0);
    expect(videoIndex).toBeLessThan(managedIndex);
  });

  it('keeps the profiles retry pointer when a table delete fails', async () => {
    primeDb({ failStatementMatching: 'delete from public.usage_events' });

    const report = await eraseUserAccountData('user-1');

    expect(report.complete).toBe(false);
    expect(report.tables['usage_events']?.error).toContain('deadlock');
    expect(report.tables['profiles']).toEqual({ deleted: false, retainedForRetry: true });
    expect(report.profileRetained).toBe(true);
    expect(executedStatements().some((sql) => sql.includes('delete from public.profiles'))).toBe(
      false,
    );
  });

  it('keeps the profiles retry pointer when stored bytes survive', async () => {
    primeDb({ mediaRows: [{ id: 'asset-1', storage_pathname: 'media/a.png' }] });
    mocks.deleteStoredMediaObjects.mockResolvedValue({
      deleted: 0,
      failedPathnames: ['media/a.png'],
    });

    const report = await eraseUserAccountData('user-1');

    expect(report.complete).toBe(false);
    expect(report.profileRetained).toBe(true);
    expect(executedStatements().some((sql) => sql.includes('delete from public.profiles'))).toBe(
      false,
    );
  });

  it('keeps the projects that still point at undeleted knowledge objects', async () => {
    primeDb({ knowledgeRows: [{ storage_uri: 'knowledge/doc.pdf' }] });
    mocks.deleteObject.mockRejectedValue(new Error('R2 unavailable'));

    const report = await eraseUserAccountData('user-1');

    expect(report.knowledgeObjectsFailed).toBe(1);
    expect(report.complete).toBe(false);
    expect(report.tables['user_projects']).toEqual({ deleted: false, retainedForRetry: true });
    expect(
      executedStatements().some((sql) => sql.includes('delete from public.user_projects')),
    ).toBe(false);
  });

  it('deletes the bytes of untracked ledger rows and settles them once the projects are gone', async () => {
    const backfilled = 'knowledge-files/projects/p1/1_backfilled.txt';
    primeDb({
      knowledgeRows: [{ storage_uri: 'knowledge-files/projects/p1/2_live.txt' }],
      untrackedLedgerKeys: [backfilled, 'knowledge-files/projects/p1/2_live.txt'],
    });

    const report = await eraseUserAccountData('user-1');

    expect(mocks.deleteObject).toHaveBeenCalledWith(backfilled);
    expect(mocks.deleteObject).toHaveBeenCalledTimes(2);
    expect(report.anonymized['project_knowledge_objects']).toEqual({ updated: true });
    expect(report.complete).toBe(true);
    const statements = executedStatements();
    const projects = statements.findIndex((sql) =>
      sql.includes('delete from public.user_projects where user_id = $1'),
    );
    const settle = statements.findIndex((sql) =>
      sql.includes("update public.project_knowledge_objects set state = 'deleted'"),
    );
    expect(projects).toBeGreaterThan(-1);
    expect(settle).toBeGreaterThan(projects);
    expect(statements[settle]).toContain(
      'object_key = null, user_id = null, organization_id = null',
    );
    expect(statements[settle]).toContain('and not origin_known');
    const settleCall = mocks.execute.mock.calls.find((call) =>
      String(call[0]).includes("set state = 'deleted'"),
    );
    expect(settleCall?.[1]).toEqual([
      'user-1',
      ['knowledge-files/projects/p1/2_live.txt', backfilled],
    ]);
  });

  it('keeps the profile while an untracked ledger row is left unsettled', async () => {
    primeDb({
      untrackedLedgerKeys: ['knowledge-files/projects/p1/1_a.txt'],
      unsettledLedgerRows: 1,
    });

    const report = await eraseUserAccountData('user-1');

    expect(report.anonymized['project_knowledge_objects']).toMatchObject({ updated: false });
    expect(report.complete).toBe(false);
    expect(report.profileRetained).toBe(true);
    expect(executedStatements().some((sql) => sql.includes('delete from public.profiles'))).toBe(
      false,
    );
  });

  it('settles no ledger row while the projects are kept for a failed byte deletion', async () => {
    primeDb({ untrackedLedgerKeys: ['knowledge-files/projects/p1/1_a.txt'] });
    mocks.deleteObject.mockRejectedValue(new Error('R2 unavailable'));

    const report = await eraseUserAccountData('user-1');

    expect(report.tables['user_projects']).toEqual({ deleted: false, retainedForRetry: true });
    expect(report.anonymized['project_knowledge_objects']).toBeUndefined();
    expect(
      executedStatements().some((sql) => sql.includes('update public.project_knowledge_objects')),
    ).toBe(false);
  });

  it('retains knowledge pointers after a backup failure and retries them after primary deletion', async () => {
    primeDb();
    let knowledgeRows = [
      { userId: 'user-1', storage_uri: 'knowledge/a.pdf' },
      { userId: 'user-1', storage_uri: 'knowledge/b.pdf' },
      { userId: 'user-2', storage_uri: 'knowledge/c.pdf' },
    ];
    const primaryKeys = new Set(knowledgeRows.map((row) => row.storage_uri));
    const primaryAttempts: Array<{ key: string; present: boolean }> = [];
    const query = mocks.query.getMockImplementation()!;
    const execute = mocks.execute.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('select k.storage_uri')) {
        expect(sql).toContain('where p.user_id = $1');
        return knowledgeRows.filter((row) => row.userId === params[0]);
      }
      return query(sql);
    });
    mocks.execute.mockImplementation(async (sql: string, params: unknown[]) => {
      const result = await execute(sql);
      if (sql.includes('delete from public.user_projects')) {
        expect(sql).toContain('where user_id = $1');
        knowledgeRows = knowledgeRows.filter((row) => row.userId !== params[0]);
      }
      return result;
    });
    mocks.deleteObject.mockImplementation(async (key: string) => {
      primaryAttempts.push({ key, present: primaryKeys.has(key) });
      primaryKeys.delete(key);
    });
    mocks.resolveObjectBackupTarget.mockReturnValue({
      store: {},
      bucket: 'agi-backup',
      region: 'us-west-1',
      endpoint: 'https://backup',
    });
    mocks.deleteBackupObject
      .mockRejectedValueOnce(new Error('backup unavailable'))
      .mockResolvedValueOnce('deleted')
      .mockResolvedValueOnce('deleted')
      .mockResolvedValueOnce('absent');

    const first = await eraseUserAccountData('user-1');

    expect(first.knowledgeObjectsDeleted).toBe(2);
    expect(first.knowledgeObjectsFailed).toBe(0);
    expect(first.backupObjectsDeleted).toBe(1);
    expect(first.backupObjectsFailed).toBe(1);
    expect(first.tables['user_projects']).toEqual({ deleted: false, retainedForRetry: true });
    expect(first.complete).toBe(false);
    expect(first.profileRetained).toBe(true);
    expect(knowledgeRows).toHaveLength(3);
    expect([...primaryKeys]).toEqual(['knowledge/c.pdf']);
    expect(executedStatements().some((sql) => sql.includes('delete from public.profiles'))).toBe(
      false,
    );
    expect(mocks.forgetBackupReplicas).toHaveBeenLastCalledWith(['knowledge/b.pdf']);

    const second = await eraseUserAccountData('user-1');

    expect(second.knowledgeObjectsDeleted).toBe(2);
    expect(second.knowledgeObjectsFailed).toBe(0);
    expect(second.backupObjectsDeleted).toBe(2);
    expect(second.backupObjectsFailed).toBe(0);
    expect(second.tables['user_projects']).toEqual({ deleted: true });
    expect(second.complete).toBe(true);
    expect(second.profileRetained).toBe(false);
    expect(knowledgeRows).toEqual([{ userId: 'user-2', storage_uri: 'knowledge/c.pdf' }]);
    expect(primaryAttempts).toEqual([
      { key: 'knowledge/a.pdf', present: true },
      { key: 'knowledge/b.pdf', present: true },
      { key: 'knowledge/a.pdf', present: false },
      { key: 'knowledge/b.pdf', present: false },
    ]);
    expect(mocks.deleteBackupObject.mock.calls.map(([key]) => key)).toEqual([
      'knowledge/a.pdf',
      'knowledge/b.pdf',
      'knowledge/a.pdf',
      'knowledge/b.pdf',
    ]);
  });

  it('retains unresolved knowledge references while disposing known objects and retries after resolution is repaired', async () => {
    primeDb();
    const legacyUri = 'https://old-assets.example.test/knowledge/legacy.pdf';
    let rows = [
      { userId: 'user-1', storage_uri: legacyUri },
      { userId: 'user-1', storage_uri: 'knowledge/current.pdf' },
      { userId: 'user-2', storage_uri: 'knowledge/other.pdf' },
    ];
    let legacyResolvable = false;
    mocks.objectKeyFromStorageUri.mockImplementation((value: string) =>
      value === legacyUri ? (legacyResolvable ? 'knowledge/legacy.pdf' : null) : value,
    );
    const query = mocks.query.getMockImplementation()!;
    const execute = mocks.execute.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('select k.storage_uri')) {
        return rows.filter((row) => row.userId === params[0]);
      }
      return query(sql);
    });
    mocks.execute.mockImplementation(async (sql: string, params: unknown[]) => {
      const result = await execute(sql);
      if (sql.includes('delete from public.user_projects')) {
        rows = rows.filter((row) => row.userId !== params[0]);
      }
      return result;
    });
    mocks.resolveObjectBackupTarget.mockReturnValue({
      store: {},
      bucket: 'agi-backup',
      region: 'us-west-1',
      endpoint: 'https://backup',
    });

    const first = await eraseUserAccountData('user-1');

    expect(first.knowledgeObjectsDeleted).toBe(1);
    expect(first.knowledgeObjectsFailed).toBe(1);
    expect(first.backupObjectsDeleted).toBe(1);
    expect(first.complete).toBe(false);
    expect(first.profileRetained).toBe(true);
    expect(first.tables['user_projects']).toEqual({ deleted: false, retainedForRetry: true });
    expect(rows).toHaveLength(3);
    expect(mocks.deleteObject.mock.calls.map(([key]) => key)).toEqual(['knowledge/current.pdf']);
    expect(mocks.deleteBackupObject.mock.calls.map(([key]) => key)).toEqual([
      'knowledge/current.pdf',
    ]);

    legacyResolvable = true;
    const second = await eraseUserAccountData('user-1');

    expect(second.knowledgeObjectsDeleted).toBe(2);
    expect(second.knowledgeObjectsFailed).toBe(0);
    expect(second.complete).toBe(true);
    expect(second.profileRetained).toBe(false);
    expect(rows).toEqual([{ userId: 'user-2', storage_uri: 'knowledge/other.pdf' }]);
    expect(mocks.deleteObject).toHaveBeenCalledWith('knowledge/legacy.pdf');
    expect(mocks.deleteObject).not.toHaveBeenCalledWith(legacyUri);
  });

  it('does not invent object failures for null or blank knowledge references', async () => {
    primeDb({
      knowledgeRows: [{ storage_uri: null }, { storage_uri: '' }, { storage_uri: ' \t ' }],
    });

    const report = await eraseUserAccountData('user-1');

    expect(report.knowledgeObjectsDeleted).toBe(0);
    expect(report.knowledgeObjectsFailed).toBe(0);
    expect(report.complete).toBe(true);
    expect(mocks.objectKeyFromStorageUri).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it('includes successful knowledge backups alongside media backup counts', async () => {
    primeDb({
      mediaRows: [{ id: 'media-1', storage_pathname: 'private-media/a.png' }],
      knowledgeRows: [{ storage_uri: 'knowledge/doc.pdf' }],
    });
    mocks.deleteStoredMediaObjects.mockResolvedValue({ deleted: 1, failedPathnames: [] });
    mocks.resolveObjectBackupTarget.mockReturnValue({
      store: {},
      bucket: 'agi-backup',
      region: 'us-west-1',
      endpoint: 'https://backup',
    });

    const report = await eraseUserAccountData('user-1');

    expect(report.backupObjectsDeleted).toBe(2);
    expect(report.backupObjectsFailed).toBe(0);
    expect(report.knowledgeObjectsDeleted).toBe(1);
    expect(report.knowledgeObjectsFailed).toBe(0);
    expect(report.complete).toBe(true);
    expect(mocks.deleteBackupObject.mock.calls.map(([key]) => key)).toEqual([
      'private-media/a.png',
      'knowledge/doc.pdf',
    ]);
  });

  it('does not remove a knowledge backup when its primary deletion failed', async () => {
    primeDb({ knowledgeRows: [{ storage_uri: 'knowledge/doc.pdf' }] });
    mocks.deleteObject.mockRejectedValueOnce(new Error('primary unavailable'));
    mocks.resolveObjectBackupTarget.mockReturnValue({
      store: {},
      bucket: 'agi-backup',
      region: 'us-west-1',
      endpoint: 'https://backup',
    });

    const report = await eraseUserAccountData('user-1');

    expect(mocks.deleteBackupObject).not.toHaveBeenCalled();
    expect(report.knowledgeObjectsFailed).toBe(1);
    expect(report.backupObjectsFailed).toBe(0);
    expect(report.tables['user_projects']).toEqual({ deleted: false, retainedForRetry: true });
    expect(report.complete).toBe(false);
  });

  it('preserves knowledge pointers when backup target resolution throws after primary disposal', async () => {
    primeDb({ knowledgeRows: [{ storage_uri: 'knowledge/doc.pdf' }] });
    mocks.resolveObjectBackupTarget.mockImplementation(() => {
      throw new Error('invalid backup configuration');
    });

    await expect(eraseUserAccountData('user-1')).rejects.toThrow('invalid backup configuration');

    expect(mocks.deleteObject).toHaveBeenCalledWith('knowledge/doc.pdf');
    expect(mocks.deleteBackupObject).not.toHaveBeenCalled();
    expect(
      executedStatements().some((sql) =>
        /delete from public\.(user_projects|profiles)\b/u.test(sql),
      ),
    ).toBe(false);
  });

  it('erases nothing and never seals the profile fence while a legal hold is active', async () => {
    primeDb({ underLegalHold: true });

    const report = await eraseUserAccountData('user-1');

    expect(report.complete).toBe(false);
    expect(report.profileRetained).toBe(true);
    expect(report.tables['legal_holds']).toMatchObject({ deleted: false, retainedForRetry: true });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.deleteStoredMediaObjects).not.toHaveBeenCalled();
    const queries = mocks.query.mock.calls.map((call) => String(call[0]));
    expect(queries.some((sql) => sql.includes('deletion_requested_at'))).toBe(false);
    expect(queries.some((sql) => sql.includes('public.legal_holds'))).toBe(true);
  });

  it('fails closed without erasing when the legal hold set cannot be read', async () => {
    primeDb({ legalHoldError: new Error('legal_holds unreachable') });

    const report = await eraseUserAccountData('user-1');

    expect(report.complete).toBe(false);
    expect(report.tables['legal_holds']?.error).toContain('legal_holds unreachable');
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('applies the same organization-scoped hold semantics as retention', async () => {
    primeDb({ underLegalHold: false });

    await eraseUserAccountData('user-1');

    const holdSql = mocks.query.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.includes('public.legal_holds'));
    expect(holdSql).toMatch(/scope = 'member'[\s\S]*subject_user_id = \$1/);
    expect(holdSql).toMatch(/scope = 'custodian'[\s\S]*legal_hold_custodians/);
    expect(holdSql).toMatch(/scope = 'organization'[\s\S]*organization_members/);
    expect(holdSql).toMatch(/released_at is null/);
  });

  it('retains the profile row for the caller that owns the retry queue', async () => {
    primeDb();

    const report = await eraseUserAccountData('user-1', { retainProfile: true });

    expect(report.complete).toBe(true);
    expect(report.profileRetained).toBe(true);
    expect(executedStatements().some((sql) => sql.includes('delete from public.profiles'))).toBe(
      false,
    );
  });
});

describe('POST /api/auth/device/refresh', () => {
  const refreshToken = 'r'.repeat(64);

  function refreshRequest(): NextRequest {
    return new NextRequest('https://api.agiworkforce.com/api/auth/device/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }

  function primeToken(owner: {
    owner_missing: boolean;
    deletionScheduledFor: string | null;
  }): void {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('insert into public.device_refresh_token_families (family_id, user_id)')) {
        return [{ family_id: 'family-1', revoked_at: null }];
      }
      if (sql.includes('FROM device_refresh_tokens')) {
        return [
          {
            id: 'token-1',
            family_id: 'family-1',
            user_id: 'user-1',
            user_email: 'user@example.com',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            used_at: null,
            revoked_at: null,
            owner_missing: owner.owner_missing,
            owner_deletion_scheduled_for: owner.deletionScheduledFor,
            owner_terms_version: CURRENT_TERMS_VERSION,
            owner_terms_accepted_at: new Date().toISOString(),
          },
        ];
      }
      if (sql.includes('INSERT INTO device_refresh_tokens')) return [{ id: 'token-2' }];
      return [];
    });
    mocks.execute.mockResolvedValue(1);
  }

  beforeEach(() => vi.clearAllMocks());

  it('rejects a token whose account has been erased and revokes its family', async () => {
    primeToken({ owner_missing: true, deletionScheduledFor: null });

    const response = await refreshDeviceSession(refreshRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_grant' });
    expect(
      executedStatements().some(
        (sql) => sql.includes('SET revoked_at') && sql.includes('family_id = $1'),
      ),
    ).toBe(true);
    const queried = mocks.query.mock.calls.map((call) => String(call[0]));
    expect(queried.some((sql) => sql.includes('INSERT INTO device_refresh_tokens'))).toBe(false);
  });

  it('rejects a token whose account is scheduled for erasure', async () => {
    primeToken({ owner_missing: false, deletionScheduledFor: new Date().toISOString() });

    const response = await refreshDeviceSession(refreshRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_grant' });
  });

  it('still rotates a live account', async () => {
    primeToken({ owner_missing: false, deletionScheduledFor: null });

    const response = await refreshDeviceSession(refreshRequest());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { access_token?: string; refresh_token?: string };
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
  });
});

type ImportedModule0 = typeof import('@/lib/server/object-backup');
