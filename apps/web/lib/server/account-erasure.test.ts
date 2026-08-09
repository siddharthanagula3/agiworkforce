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
}));

process.env['JWT_SECRET'] = 'test-developer-jwt-secret-at-least-32-bytes';

import {
  ANONYMIZED_USER_COLUMNS,
  UNDELETED_USER_TABLES,
  USER_SCOPED_TABLES,
  eraseUserAccountData,
} from './account-erasure';
import { POST as refreshDeviceSession } from '@/app/api/auth/device/refresh/route';

/**
 * Columns that make a row personal to one account. A table carrying any of
 * them must be classified by account-erasure.ts.
 */
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

/**
 * Read the live schema out of the migrations so the erasure inventory is
 * checked against the database it runs on rather than against itself.
 */
function schemaColumnsByTable(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    // Line comments carry example DDL (see 0043's manual verification block).
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
}

function primeDb(fixture: ErasureFixture = {}): void {
  mocks.query.mockImplementation(async (sql: string) => {
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

    // Sanity check on the derivation itself: a parse that found nothing would
    // make every assertion below vacuous.
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
      // `profiles` is scoped by its own primary key, so it is not in the
      // derived set; everything else must be a real, user-scoped table.
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
});

describe('eraseUserAccountData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.objectStorageConfigured.mockReturnValue(true);
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.deleteStoredMediaObjects.mockResolvedValue({ deleted: 0, failedPathnames: [] });
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
    for (const { table, column } of ANONYMIZED_USER_COLUMNS) {
      expect(
        statements.some((sql) => sql.includes(`update public.${table} set ${column} = null`)),
      ).toBe(true);
    }
    expect(statements.at(-1)).toContain('delete from public.profiles');
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
    // No replacement credential was minted for an account that no longer exists.
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
