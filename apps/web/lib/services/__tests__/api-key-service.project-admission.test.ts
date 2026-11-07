import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiKeyRow } from '@/lib/server/neon-types';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.query, execute: mocks.execute }),
}));
vi.mock('argon2', () => ({
  default: { verify: mocks.verify, hash: vi.fn(), argon2id: 2 },
}));

import { ApiKeyService } from '../api-key-service';

const NOW = Date.parse('2026-11-07T12:00:00.000Z');
const KEY_PREFIX = '0123456789abcdef';
const RAW_KEY = `sk_live_${KEY_PREFIX}_fixtureSecret`;
const PROJECT_ID = 'project-1';
const USER_ID = 'user-1';
const PROJECT_PREDICATE =
  'and (api_keys.project_id is null or exists ( select 1 from public.developer_projects p ' +
  'where p.id = api_keys.project_id and p.user_id = api_keys.user_id and p.archived_at is null ))';

type StoredKey = ApiKeyRow & { project_id: string | null; organization_id: string | null };
type StoredProject = { id: string; user_id: string; archived_at: string | null };
let keys: StoredKey[];
let projects: StoredProject[];

function key(overrides: Partial<StoredKey> = {}): StoredKey {
  return {
    id: 'key-1',
    user_id: USER_ID,
    name: 'Fixture key',
    key_hash: 'fixture-stored-hash',
    key_prefix: KEY_PREFIX,
    scopes: ['models:read'],
    project_id: PROJECT_ID,
    organization_id: null,
    created_at: '2026-11-01T00:00:00.000Z',
    expires_at: null,
    revoked_at: null,
    last_used_at: null,
    ...overrides,
  };
}

function normalize(sql: string): string {
  return sql.toLowerCase().replace(/\s+/g, ' ').trim();
}

// This source model is predicate-sensitive, not a PostgreSQL or RLS execution.
function lookup(sql: string, params: readonly unknown[]): Array<Record<string, unknown>> {
  const statement = normalize(sql);
  const projection = /^select (.+?) from api_keys where /.exec(statement);
  if (!projection) throw new Error('Unexpected verifier lookup');
  const hasProjectGate = statement.includes(PROJECT_PREDICATE);
  const admitted = keys.filter((row) => {
    if (statement.includes('key_prefix = $1') && row.key_prefix !== params[0]) return false;
    if (statement.includes('and revoked_at is null') && row.revoked_at !== null) return false;
    if (
      statement.includes('and (expires_at is null or expires_at > now())') &&
      row.expires_at !== null &&
      Date.parse(row.expires_at) <= NOW
    ) {
      return false;
    }
    return (
      !hasProjectGate ||
      row.project_id === null ||
      projects.some(
        (project) =>
          project.id === row.project_id &&
          project.user_id === row.user_id &&
          project.archived_at === null,
      )
    );
  });
  const limit = / limit (\d+)$/.exec(statement);
  return admitted
    .slice(0, limit ? Number(limit[1]) : undefined)
    .map((row) =>
      Object.fromEntries(
        projection[1]!.split(', ').map((column) => [column, row[column as keyof StoredKey]]),
      ),
    );
}

beforeEach(() => {
  keys = [key()];
  projects = [{ id: PROJECT_ID, user_id: USER_ID, archived_at: null }];
  mocks.query
    .mockReset()
    .mockImplementation(async (sql: string, params: readonly unknown[]) => lookup(sql, params));
  mocks.execute.mockReset().mockResolvedValue(1);
  mocks.verify
    .mockReset()
    .mockImplementation(
      async (hash: string, raw: string) => hash === 'fixture-stored-hash' && raw === RAW_KEY,
    );
});

describe('canonical API key project admission (source model)', () => {
  it('keeps the lookup projection and old predicates with the exact owner-correlated live-project gate', async () => {
    await ApiKeyService.verifyKey(RAW_KEY);
    expect(mocks.query).toHaveBeenCalledOnce();
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(normalize(sql)).toBe(
      'select id, user_id, name, key_hash, key_prefix, scopes, created_at, expires_at, last_used_at ' +
        'from api_keys where key_prefix = $1 and revoked_at is null ' +
        'and (expires_at is null or expires_at > now()) ' +
        PROJECT_PREDICATE +
        ' limit 2',
    );
    expect(params).toEqual([KEY_PREFIX]);
  });

  describe.each([null, 'organization-1'])('organization_id=%s', (organizationId) => {
    it.each([
      {
        state: 'NULL reference',
        projectId: null,
        projectOwner: USER_ID,
        archivedAt: null,
        exists: true,
        allowed: true,
      },
      {
        state: 'owned live',
        projectId: PROJECT_ID,
        projectOwner: USER_ID,
        archivedAt: null,
        exists: true,
        allowed: true,
      },
      {
        state: 'owned archived',
        projectId: PROJECT_ID,
        projectOwner: USER_ID,
        archivedAt: '2026-11-06',
        exists: true,
        allowed: false,
      },
      {
        state: 'foreign live',
        projectId: PROJECT_ID,
        projectOwner: 'other-user',
        archivedAt: null,
        exists: true,
        allowed: false,
      },
      {
        state: 'foreign archived',
        projectId: PROJECT_ID,
        projectOwner: 'other-user',
        archivedAt: '2026-11-06',
        exists: true,
        allowed: false,
      },
      {
        state: 'missing reference',
        projectId: 'missing-project',
        projectOwner: USER_ID,
        archivedAt: null,
        exists: true,
        allowed: false,
      },
      {
        state: 'empty projects',
        projectId: PROJECT_ID,
        projectOwner: USER_ID,
        archivedAt: null,
        exists: false,
        allowed: false,
      },
    ])(
      '$state: allowed=$allowed',
      async ({ projectId, projectOwner, archivedAt, exists, allowed }) => {
        keys = [key({ organization_id: organizationId, project_id: projectId })];
        projects = exists
          ? [{ id: PROJECT_ID, user_id: projectOwner, archived_at: archivedAt }]
          : [];
        const result = await ApiKeyService.verifyKey(RAW_KEY);
        if (allowed) {
          expect(result).toEqual({
            id: 'key-1',
            user_id: USER_ID,
            name: 'Fixture key',
            scopes: ['models:read'],
            created_at: '2026-11-01T00:00:00.000Z',
            expires_at: null,
            last_used_at: null,
          });
          expect(mocks.verify).toHaveBeenCalledExactlyOnceWith('fixture-stored-hash', RAW_KEY);
          expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(
            'UPDATE api_keys SET last_used_at = $1 WHERE id = $2',
            [expect.any(String), 'key-1'],
          );
        } else {
          expect(result).toBeNull();
          expect(mocks.verify).not.toHaveBeenCalled();
          expect(mocks.execute).not.toHaveBeenCalled();
        }
      },
    );

    it('rereads project state after a modeled archive without persisted key revocation', async () => {
      keys = [key({ organization_id: organizationId })];
      expect(await ApiKeyService.verifyKey(RAW_KEY)).not.toBeNull();
      projects[0]!.archived_at = '2026-11-07T12:00:00.000Z';
      expect(keys[0]!.revoked_at).toBeNull();
      expect(await ApiKeyService.verifyKey(RAW_KEY)).toBeNull();
      expect(mocks.query).toHaveBeenCalledTimes(2);
      expect(mocks.verify).toHaveBeenCalledOnce();
      expect(mocks.execute).toHaveBeenCalledOnce();
    });
  });

  it('permits the NULL reference left by modeled ON DELETE SET NULL', async () => {
    projects = [];
    keys[0]!.project_id = null;
    expect(await ApiKeyService.verifyKey(RAW_KEY)).not.toBeNull();
  });

  it.each([
    { state: 'wrong prefix', overrides: { key_prefix: 'fedcba9876543210' } },
    { state: 'revoked', overrides: { revoked_at: '2026-11-06' } },
    { state: 'expired', overrides: { expires_at: new Date(NOW - 1).toISOString() } },
    { state: 'expiry equal to now', overrides: { expires_at: new Date(NOW).toISOString() } },
  ])('still rejects $state before hash verification', async ({ overrides }) => {
    keys = [key(overrides)];
    expect(await ApiKeyService.verifyKey(RAW_KEY)).toBeNull();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('still permits a future expiry', async () => {
    keys[0]!.expires_at = new Date(NOW + 1).toISOString();
    expect(await ApiKeyService.verifyKey(RAW_KEY)).not.toBeNull();
  });

  it('still rejects the wrong secret without updating last_used_at', async () => {
    expect(await ApiKeyService.verifyKey(`sk_live_${KEY_PREFIX}_wrongSecret`)).toBeNull();
    expect(mocks.verify).toHaveBeenCalledOnce();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('still fails closed on a hash verification error', async () => {
    mocks.verify.mockRejectedValueOnce(new Error('hash verification unavailable'));
    expect(await ApiKeyService.verifyKey(RAW_KEY)).toBeNull();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('propagates lookup failure without hashing or last-used effects', async () => {
    const failure = new Error('lookup unavailable');
    mocks.query.mockRejectedValueOnce(failure);
    await expect(ApiKeyService.verifyKey(RAW_KEY)).rejects.toBe(failure);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('does not turn a last-used write failure into a verification rejection', async () => {
    mocks.execute.mockRejectedValueOnce(new Error('last-used write unavailable'));
    expect(await ApiKeyService.verifyKey(RAW_KEY)).not.toBeNull();
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
});
