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
  objectStorageConfigured: vi.fn(() => true),
  deleteE2BSessionsForUser: vi.fn(),
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
}));
vi.mock('@/lib/server/object-storage', () => ({
  deleteObject: (...args: unknown[]) => mocks.deleteObject(...args),
  isObjectStorageConfigured: () => mocks.objectStorageConfigured(),
  objectKeyFromPublicUrl: (value: string) =>
    value.startsWith('https://cdn/') ? value.slice(12) : null,
  objectKeyFromStorageUri: (value: string) => value,
  StoredObjectTooLargeError: class StoredObjectTooLargeError extends Error {},
  deletePrivateObject: vi.fn(),
  getBoundedObject: vi.fn(),
  getBoundedPrivateObject: vi.fn(),
  getObject: vi.fn(),
  getObjectStream: vi.fn(),
  getPrivateObject: vi.fn(),
  getPrivateObjectStream: vi.fn(),
  isPrivateObjectStorageConfigured: vi.fn(() => true),
  putPrivateObject: vi.fn(),
}));
vi.mock('@/lib/server/project-knowledge-object-storage', () => ({
  deleteProjectKnowledgeObject: (...args: unknown[]) => mocks.deleteObject(...args),
  isProjectKnowledgeObjectStorageConfigured: () => mocks.objectStorageConfigured(),
}));
vi.mock('@/lib/e2b/session-store', () => ({
  deleteE2BSessionsForUser: (...args: unknown[]) => mocks.deleteE2BSessionsForUser(...args),
}));

process.env['JWT_SECRET'] = 'test-developer-jwt-secret-at-least-32-bytes';

import {
  ANONYMIZED_USER_COLUMNS,
  UNDELETED_USER_TABLES,
  USER_SCOPED_TABLES,
  eraseUserAccountData,
} from './account-erasure';
import { POST as refreshDeviceSession } from '@/app/api/auth/device/refresh/route';
import { CURRENT_TERMS_VERSION } from '@/lib/server/terms';

const SCOPE_COLUMNS = new Set([
  'user_id',
  'owner_id',
  'owner_user_id',
  'actor_user_id',
  'created_by',
  'added_by_user_id',
  'granted_by_user_id',
  'agent_user_id',
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
  avatarUrl?: string | null;
  failStatementMatching?: string;
  activeVideoJobs?: boolean;
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
    if (sql.includes("to_regclass('public.video_generation_jobs')")) {
      return [{ provisioned: true }];
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
    if (sql.includes('from public.video_generation_jobs')) {
      if (fixture.videoGateError) throw fixture.videoGateError;
      return [
        {
          has_blocking:
            (fixture.activeVideoJobs ?? false) ||
            (fixture.pendingVideoIncident ?? false) ||
            (fixture.pendingVideoSettlement ?? false),
        },
      ];
    }
    if (sql.includes('media_assets')) return fixture.mediaRows ?? [];
    if (sql.includes('project_knowledge_files')) return fixture.knowledgeRows ?? [];
    if (sql.includes('avatar_url')) return [{ avatar_url: fixture.avatarUrl ?? null }];
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
  return mocks.execute.mock.calls.map((call) => String(call[0]));
}

describe('account erasure inventory', () => {
  it('classifies every user-scoped table in the schema', () => {
    const scoped = userScopedSchemaTables();
    const deleted = new Set(USER_SCOPED_TABLES.map((entry) => entry.table));
    const anonymized = new Set(ANONYMIZED_USER_COLUMNS.map((entry) => entry.table));
    const undeleted = new Set(Object.keys(UNDELETED_USER_TABLES));

    expect(scoped.size).toBeGreaterThan(50);

    const unclassified = [...scoped.keys()]
      .filter((table) => !deleted.has(table) && !anonymized.has(table) && !undeleted.has(table))
      .sort();
    expect(unclassified).toEqual([]);
  });

  it('classifies each table exactly once, by a column that exists', () => {
    const scoped = userScopedSchemaTables();
    const schema = schemaColumnsByTable();
    const buckets = [
      USER_SCOPED_TABLES.map((entry) => entry.table),
      ANONYMIZED_USER_COLUMNS.map((entry) => entry.table),
      Object.keys(UNDELETED_USER_TABLES),
    ];

    const seen = new Map<string, number>();
    buckets.forEach((bucket, index) => {
      for (const table of bucket) {
        expect(seen.has(table), `${table} is classified twice`).toBe(false);
        seen.set(table, index);
      }
    });

    for (const [table, index] of seen) {
      if (table === 'profiles') continue;
      expect(scoped.has(table), `${table} is classified but not user-scoped in the schema`).toBe(
        true,
      );
      if (index === 2) continue;
      const bucket = index === 0 ? USER_SCOPED_TABLES : ANONYMIZED_USER_COLUMNS;
      const entry = bucket.find((candidate) => candidate.table === table)!;
      expect(schema.get(table)?.has(entry.column), `${table}.${entry.column} does not exist`).toBe(
        true,
      );
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
});

describe('eraseUserAccountData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.objectStorageConfigured.mockReturnValue(true);
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.deleteStoredMediaObjects.mockResolvedValue({ deleted: 0, failedPathnames: [] });
    mocks.deleteE2BSessionsForUser.mockResolvedValue({ deleted: 0, failed: 0, reachable: true });
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

  it('keeps the account open for retry when cached sandbox state survived', async () => {
    primeDb({});
    mocks.deleteE2BSessionsForUser.mockResolvedValue({ deleted: 0, failed: 2, reachable: true });

    const report = await eraseUserAccountData('user-1');

    expect(report.cacheKeysFailed).toBe(2);
    expect(report.complete).toBe(false);
    expect(report.profileRetained).toBe(true);
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
    for (const { table } of USER_SCOPED_TABLES) {
      expect(statements.some((sql) => sql.includes(`delete from public.${table} `))).toBe(true);
    }
    expect(
      statements.some((sql) => sql.includes('delete from public.user_skills where user_id = $1')),
    ).toBe(true);
    for (const { table, column } of ANONYMIZED_USER_COLUMNS) {
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
