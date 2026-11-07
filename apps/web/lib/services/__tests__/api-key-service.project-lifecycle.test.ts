import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ hash: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => { throw new Error('Unexpected database scope replacement'); },
}));
vi.mock('argon2', () => ({
  default: { hash: mocks.hash, verify: vi.fn(), argon2id: 2 },
}));

import { API_KEY_SCOPE_VALUES } from '@/lib/api-key-scopes';
import { ApiKeyService, API_KEY_MAX_LIFETIME_DAYS_ENV } from '../api-key-service';
import { archiveDeveloperProject, readLiveDeveloperProject } from '../developer-project-service';

const USER = 'lifecycle-owner';
const PROJECT = 'aaaaaaaa-1111-4111-8111-111111111111';
const OTHER_PROJECT = '22222222-2222-4222-8222-222222222222';
const KEY = 'bbbbbbbb-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-07T12:00:00.000Z');
const FUTURE = '2026-11-08T12:00:00.000Z';
const PROJECT_COLUMNS = 'id, name, monthly_credit_limit, archived_at, created_at';
const SQL = {
  preflight: `select ${PROJECT_COLUMNS} from public.developer_projects where id = $1 and user_id = $2 and archived_at is null limit 1`,
  admit: 'update public.developer_projects set updated_at = now() where id = $1 and user_id = $2 and archived_at is null returning id',
  discover: 'select id, name, scopes, expires_at, project_id from public.api_keys where id = $1 and user_id = $2 and revoked_at is null limit 2',
  lock: 'select id, name, scopes, expires_at, project_id from public.api_keys where id = $1 and user_id = $2 and revoked_at is null limit 2 for update',
  insert: 'insert into api_keys (user_id, name, key_hash, key_prefix, scopes, expires_at, project_id) values ($1, $2, $3, $4, $5, $6, $7) returning *',
  revoke: 'update api_keys set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null',
  archive: `update public.developer_projects set archived_at = now() where id = $1 and user_id = $2 and archived_at is null returning ${PROJECT_COLUMNS}`,
  bulkRevoke: 'update public.api_keys set revoked_at = now() where project_id = $1 and user_id = $2 and revoked_at is null returning id',
};

interface Key {
  id: string;
  user_id: string;
  organization_id: string | null;
  project_id: unknown;
  name: unknown;
  scopes: unknown;
  expires_at: unknown;
  revoked_at: string | null;
  key_hash?: unknown;
  key_prefix?: unknown;
}
interface Project {
  id: string;
  user_id: string;
  name: string;
  monthly_credit_limit: null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
interface State { keys: Key[]; projects: Project[] }
interface Options {
  workspace?: string | null;
  keys?: Key[];
  projects?: Project[];
  admissionReceipt?: unknown[];
  discoveryReceipt?: unknown[];
  lockReceipt?: unknown[];
  insertReceipt?: 'empty' | 'duplicate';
  revokeCount?: number;
  failAt?: 'admit' | 'insert' | 'revoke' | 'commit' | 'bulkRevoke';
  failure?: Error;
  beforeLock?: (state: State) => void;
  commitGate?: Promise<void>;
}
function seedKey(overrides: Partial<Key> = {}): Key {
  return {
    id: KEY, user_id: USER, organization_id: null, project_id: PROJECT,
    name: 'Deployment', scopes: ['models:read'], expires_at: FUTURE, revoked_at: null,
    ...overrides,
  };
}
function seedProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT, user_id: USER, name: 'Application', monthly_credit_limit: null,
    archived_at: null, created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z', ...overrides,
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function normalize(sql: string) { return sql.toLowerCase().replace(/\s+/gu, ' ').trim(); }
function sameUuid(left: unknown, right: unknown) {
  return typeof left === 'string' && typeof right === 'string' && left.toLowerCase() === right.toLowerCase();
}

// Strict SQL and staged-result model only: no PostgreSQL concurrency, isolation or RLS proof.
function model(options: Options = {}) {
  let committed: State = {
    keys: structuredClone(options.keys ?? [seedKey()]),
    projects: structuredClone(options.projects ?? [seedProject()]),
  };
  const events: string[] = [];
  const calls: Array<{ handle: 'outer' | 'tx'; sql: string; params: unknown[] }> = [];
  const callbackDone = deferred();
  const workspace = options.workspace ?? null;
  const visible = (key: Key) => key.organization_id === workspace;
  const forbidden = (): never => { throw new Error('Unexpected scope change or nested transaction'); };
  const fail = (at: Options['failAt']) => {
    if (options.failAt === at) throw options.failure ?? new Error(`fixture ${at} failure`);
  };
  const projectRows = (state: State, params: unknown[]) => state.projects.filter((row) =>
    sameUuid(row.id, params[0]) && row.user_id === params[1] && row.archived_at === null);
  const db: DatabaseAdapter = {
    withUser: forbidden, withOrg: forbidden, dispose: async () => {},
    execute: forbidden,
    query: async <Row>(sql: string, params: unknown[] = []): Promise<Row[]> => {
      calls.push({ handle: 'outer', sql: normalize(sql), params });
      if (normalize(sql) !== SQL.preflight) throw new Error('Lifecycle SQL escaped transaction');
      events.push('preflight');
      return structuredClone(projectRows(committed, params)) as unknown as Row[];
    },
    transaction: async <T>(run: (tx: DatabaseAdapter) => Promise<T>): Promise<T> => {
      events.push('begin');
      const staged = structuredClone(committed);
      const tx: DatabaseAdapter = {
        withUser: forbidden, withOrg: forbidden, transaction: forbidden, dispose: async () => {},
        query: async <Row>(sql: string, params: unknown[] = []): Promise<Row[]> => {
          const statement = normalize(sql);
          calls.push({ handle: 'tx', sql: statement, params });
          let rows: unknown[];
          if (statement === SQL.admit) {
            events.push('admit');
            fail('admit');
            const admitted = projectRows(staged, params);
            admitted.forEach((row) => { row.updated_at = NOW.toISOString(); });
            rows = options.admissionReceipt ?? admitted.map(({ id }) => ({ id }));
          } else if (statement === SQL.discover || statement === SQL.lock) {
            const locked = statement === SQL.lock;
            events.push(locked ? 'lock' : 'discover');
            if (locked) options.beforeLock?.(staged);
            rows = (locked ? options.lockReceipt : options.discoveryReceipt) ?? staged.keys.filter((row) =>
              sameUuid(row.id, params[0]) && row.user_id === params[1] && row.revoked_at === null && visible(row))
              .slice(0, 2).map(({ id, name, scopes, expires_at, project_id }) =>
                ({ id, name, scopes, expires_at, project_id }));
          } else if (statement === SQL.insert) {
            events.push('insert');
            fail('insert');
            const row = seedKey({
              id: `replacement-${staged.keys.length}`, user_id: params[0] as string,
              name: params[1], key_hash: params[2], key_prefix: params[3], scopes: params[4],
              expires_at: params[5], project_id: params[6], organization_id: workspace,
            });
            staged.keys.push(row);
            rows = options.insertReceipt === 'empty' ? [] : options.insertReceipt === 'duplicate' ? [row, row] : [row];
          } else if (statement === SQL.archive) {
            events.push('archive');
            rows = projectRows(staged, params);
            (rows as Project[]).forEach((row) => { row.archived_at = NOW.toISOString(); });
          } else if (statement === SQL.bulkRevoke) {
            events.push('bulkRevoke');
            fail('bulkRevoke');
            rows = staged.keys.filter((row) => sameUuid(row.project_id, params[0])
              && row.user_id === params[1] && row.revoked_at === null && visible(row));
            (rows as Key[]).forEach((row) => { row.revoked_at = NOW.toISOString(); });
            rows = (rows as Key[]).map(({ id }) => ({ id }));
          } else {
            throw new Error(`Unexpected transaction SQL: ${statement}`);
          }
          return structuredClone(rows) as Row[];
        },
        execute: async (sql: string, params: unknown[] = []): Promise<number> => {
          calls.push({ handle: 'tx', sql: normalize(sql), params });
          if (normalize(sql) !== SQL.revoke) throw new Error('Unexpected revoke SQL');
          events.push('revoke');
          fail('revoke');
          const rows = staged.keys.filter((row) => sameUuid(row.id, params[0])
            && row.user_id === params[1] && row.revoked_at === null && visible(row));
          rows.forEach((row) => { row.revoked_at = NOW.toISOString(); });
          return options.revokeCount ?? rows.length;
        },
      };
      try {
        const result = await run(tx);
        events.push('callbackDone');
        callbackDone.resolve();
        await options.commitGate;
        fail('commit');
        committed = staged;
        events.push('commit');
        return result;
      } catch (error) {
        events.push('rollback');
        throw error;
      }
    },
  };
  return { db, events, calls, callbackDone: callbackDone.promise, state: () => structuredClone(committed) };
}
function create(m: ReturnType<typeof model>, projectId: string | null = PROJECT) {
  return ApiKeyService.createApiKey(m.db, USER, 'New key', ['models:read'], null, projectId);
}
function rotate(m: ReturnType<typeof model>) { return ApiKeyService.rotateApiKey(m.db, USER, KEY); }
function unchanged(m: ReturnType<typeof model>, before: State) {
  expect(m.state()).toEqual(before);
  expect(m.events.at(-1)).toBe('rollback');
  expect(m.calls.every((call) => call.handle === 'tx')).toBe(true);
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  vi.stubEnv(API_KEY_MAX_LIFETIME_DAYS_ENV, '365');
  mocks.hash.mockReset().mockResolvedValue('fixture-hash');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('canonical project/key lifecycle SQL model (not PostgreSQL execution)', () => {
  it('creates through one project write before hashing and insertion, on the transaction handle', async () => {
    const m = model();
    mocks.hash.mockImplementation(async () => { m.events.push('hash'); return 'fixture-hash'; });
    const result = await create(m);
    expect(m.events).toEqual(['begin', 'admit', 'hash', 'insert', 'callbackDone', 'commit']);
    expect(m.calls.map(({ handle, sql }) => [handle, sql])).toEqual([['tx', SQL.admit], ['tx', SQL.insert]]);
    expect(m.calls[0]?.params).toEqual([PROJECT, USER]);
    expect(result.rawKey).toMatch(/^sk_live_[a-f0-9]{16}_[a-f0-9]{48}$/u);
    expect(m.state().projects[0]?.updated_at).toBe(NOW.toISOString());
    expect(m.state().keys.at(-1)?.key_hash).toBe('fixture-hash');
  });

  it.each(['create', 'rotate'] as const)('%s keeps NULL association without project SQL', async (operation) => {
    const m = model({ keys: [seedKey({ project_id: null })], projects: [] });
    const result = await (operation === 'create' ? create(m, null) : rotate(m));
    expect(result.apiKey.project_id).toBeNull();
    expect(m.events).not.toContain('admit');
    expect(m.calls.every(({ sql }) => !sql.includes('developer_projects'))).toBe(true);
  });

  it('rejects creation after an earlier live preflight and committed archive', async () => {
    const m = model();
    expect(await readLiveDeveloperProject(m.db, USER, PROJECT)).not.toBeNull();
    await archiveDeveloperProject(m.db, USER, PROJECT);
    const archived = m.state();
    await expect(create(m)).rejects.toThrow();
    expect(m.state()).toEqual(archived);
    expect(m.events).toEqual(['preflight', 'begin', 'archive', 'bulkRevoke', 'callbackDone', 'commit', 'begin', 'admit', 'rollback']);
    expect(mocks.hash).not.toHaveBeenCalled();
  });

  it('revokes a committed creation when archive is the next modeled transaction', async () => {
    const m = model({ keys: [] });
    const created = await create(m);
    const archived = await archiveDeveloperProject(m.db, USER, PROJECT);
    expect(archived.revokedKeyIds).toEqual([created.apiKey.id]);
    expect(m.state().keys[0]?.revoked_at).toBe(NOW.toISOString());
    expect(m.events.slice(-5)).toEqual(['begin', 'archive', 'bulkRevoke', 'callbackDone', 'commit']);
  });

  it.each([null, 'workspace-a'])('keeps archive owner, project and modeled workspace scope (%s)', async (workspace) => {
    const m = model({ workspace, keys: [
      seedKey({ organization_id: workspace }),
      seedKey({ id: 'foreign-owner', user_id: 'another-owner', organization_id: workspace }),
      seedKey({ id: 'other-project', project_id: OTHER_PROJECT, organization_id: workspace }),
      seedKey({ id: 'other-workspace', organization_id: workspace === null ? 'workspace-b' : null }),
    ] });
    expect((await archiveDeveloperProject(m.db, USER, PROJECT)).revokedKeyIds).toEqual([KEY]);
    expect(m.state().keys.filter((key) => key.revoked_at !== null).map((key) => key.id)).toEqual([KEY]);
    expect(m.calls.map(({ sql, params }) => ({ sql, params }))).toEqual([
      { sql: SQL.archive, params: [PROJECT, USER] }, { sql: SQL.bulkRevoke, params: [PROJECT, USER] },
    ]);
  });

  it.each(['missing', 'foreign', 'archived'] as const)('rejects %s project for creation and rotation', async (state) => {
    const projects = state === 'missing' ? [] : [seedProject(state === 'foreign'
      ? { user_id: 'another-owner' } : { archived_at: NOW.toISOString() })];
    for (const operation of [create, rotate]) {
      const m = model({ projects });
      const before = m.state();
      await expect(operation(m)).rejects.toThrow();
      unchanged(m, before);
      expect(m.events).not.toContain('insert');
      expect(m.events).not.toContain('revoke');
    }
    expect(mocks.hash).not.toHaveBeenCalled();
  });

  it.each([[], [{}], [{ id: null }], [{ id: OTHER_PROJECT }], [{ id: PROJECT }, { id: PROJECT }]]
    .map((admissionReceipt) => ({ admissionReceipt })))('rejects invalid project receipt $admissionReceipt', async ({ admissionReceipt }) => {
    for (const operation of [create, rotate]) {
      const m = model({ admissionReceipt });
      const before = m.state();
      await expect(operation(m)).rejects.toThrow();
      unchanged(m, before);
      expect(m.events).not.toContain('lock');
      expect(m.events).not.toContain('insert');
    }
  });

  it.each([null, 'workspace-a'])('rotates with project-write before locked reread and inherits modeled workspace (%s)', async (workspace) => {
    const m = model({ workspace, keys: [seedKey({ organization_id: workspace })] });
    const result = await rotate(m);
    expect(m.events).toEqual(['begin', 'discover', 'admit', 'lock', 'revoke', 'insert', 'callbackDone', 'commit']);
    expect(m.calls.map(({ sql }) => sql)).toEqual([SQL.discover, SQL.admit, SQL.lock, SQL.revoke, SQL.insert]);
    expect(m.calls[2]?.params).toEqual([KEY, USER]);
    expect(result.apiKey).toMatchObject({ name: 'Deployment', scopes: ['models:read'], expires_at: FUTURE, project_id: PROJECT });
    expect(m.state().keys.at(-1)?.organization_id).toBe(workspace);
    await expect(rotate(m)).rejects.toMatchObject({ reason: 'not_found' });
    expect(m.state().keys).toHaveLength(2);
  });

  it.each([[PROJECT, OTHER_PROJECT], [PROJECT, null], [null, PROJECT]])('refuses association transition %s -> %s between discovery and lock', async (from, to) => {
    const m = model({ keys: [seedKey({ project_id: from })], beforeLock: (state) => { state.keys[0]!.project_id = to; } });
    const before = m.state();
    await expect(rotate(m)).rejects.toMatchObject({ reason: 'changed' });
    unchanged(m, before);
    expect(m.events).not.toContain('revoke');
    expect(m.events).not.toContain('insert');
  });

  it.each([undefined, '', 'malformed', 7])('rejects malformed discovery association %s before admission', async (projectId) => {
    const m = model({ keys: [seedKey({ project_id: projectId })] });
    await expect(rotate(m)).rejects.toMatchObject({ reason: 'metadata' });
    expect(m.events).toEqual(['begin', 'discover', 'rollback']);
  });

  it.each([
    { label: 'revoked', patch: { revoked_at: NOW.toISOString() } },
    { label: 'foreign owner', patch: { user_id: 'another-owner' } },
    { label: 'foreign workspace', patch: { organization_id: 'workspace-b' } },
  ])('does not rotate $label', async ({ patch }) => {
    const m = model({ keys: [seedKey(patch)] });
    await expect(rotate(m)).rejects.toMatchObject({ reason: 'not_found' });
    expect(m.events).toEqual(['begin', 'discover', 'rollback']);
  });

  it.each([
    { label: 'expired', patch: { expires_at: NOW.toISOString() }, reason: 'metadata' },
    { label: 'missing expiry', patch: { expires_at: undefined }, reason: 'metadata' },
    { label: 'invalid expiry', patch: { expires_at: 'not-a-date' }, reason: 'metadata' },
    { label: 'too distant expiry', patch: { expires_at: '2030-01-01' }, reason: 'metadata' },
    { label: 'invalid name', patch: { name: null }, reason: 'metadata' },
    { label: 'unsupported permissions', patch: { scopes: ['removed:scope'] }, reason: 'permissions' },
    { label: 'duplicate permissions', patch: { scopes: ['models:read', 'models:read'] }, reason: 'permissions' },
    { label: 'nonarray permissions', patch: { scopes: 'models:read' }, reason: 'permissions' },
    { label: 'nonstring permissions', patch: { scopes: [7] }, reason: 'permissions' },
  ])('validates $label from the locked row, not stale discovery', async ({ patch, reason }) => {
    const m = model({ beforeLock: (state) => { Object.assign(state.keys[0]!, patch); } });
    const before = m.state();
    await expect(rotate(m)).rejects.toMatchObject({ reason });
    unchanged(m, before);
    expect(m.events).toEqual(['begin', 'discover', 'admit', 'lock', 'rollback']);
  });

  it.each([{ scopes: null }, { scopes: [] }])('retains legacy permission expansion for $scopes', async ({ scopes }) => {
    const m = model({ keys: [seedKey({ scopes })] });
    expect((await rotate(m)).apiKey.scopes).toEqual([...API_KEY_SCOPE_VALUES]);
  });

  it.each(['discoveryReceipt', 'lockReceipt'] as const)('rejects bad %s counts and identities', async (field) => {
    for (const receipt of [[], [{}], [{ id: null }], [seedKey({ id: 'wrong-id' })], [seedKey(), seedKey()]]) {
      const m = model({ [field]: receipt });
      const before = m.state();
      await expect(rotate(m)).rejects.toMatchObject({ reason: 'not_found' });
      unchanged(m, before);
      expect(m.events).not.toContain('revoke');
    }
  });

  it.each([0, 2, -1])('rolls back on nonexact revocation count %s', async (revokeCount) => {
    const m = model({ revokeCount });
    const before = m.state();
    await expect(rotate(m)).rejects.toMatchObject({ reason: 'changed' });
    unchanged(m, before);
    expect(m.events).not.toContain('insert');
  });

  it.each(['empty', 'duplicate'] as const)('rolls back invalid insert receipt %s', async (insertReceipt) => {
    for (const operation of [create, rotate]) {
      const m = model({ insertReceipt });
      const before = m.state();
      await expect(operation(m)).rejects.toThrow();
      unchanged(m, before);
    }
  });

  it.each(['admit', 'insert', 'revoke', 'commit'] as const)('propagates %s failure with no committed replacement', async (failAt) => {
    const failure = new Error('injected failure');
    const m = model({ failAt, failure });
    const before = m.state();
    await expect(rotate(m)).rejects.toBe(failure);
    unchanged(m, before);
  });

  it('rolls back project write and revocation on hash failure', async () => {
    const failure = new Error('hash unavailable');
    mocks.hash.mockRejectedValueOnce(failure);
    const m = model();
    const before = m.state();
    await expect(rotate(m)).rejects.toBe(failure);
    unchanged(m, before);
    expect(m.events).not.toContain('insert');
  });

  it('rolls back project archive when scoped bulk revoke fails', async () => {
    const m = model({ failAt: 'bulkRevoke' });
    const before = m.state();
    await expect(archiveDeveloperProject(m.db, USER, PROJECT)).rejects.toThrow('fixture bulkRevoke failure');
    unchanged(m, before);
  });

  it.each(['create', 'rotate'] as const)('%s withholds the returned secret until modeled commit', async (operation) => {
    const gate = deferred();
    const m = model({ commitGate: gate.promise });
    const before = m.state();
    let disclosed = false;
    const pending = (operation === 'create' ? create(m) : rotate(m)).then((value) => { disclosed = true; return value; });
    try {
      await Promise.race([m.callbackDone, pending]);
      expect(disclosed).toBe(false);
      expect(m.events.at(-1)).toBe('callbackDone');
      expect(m.state()).toEqual(before);
    } finally {
      gate.resolve();
    }
    expect((await pending).rawKey).toMatch(/^sk_live_/u);
    expect(disclosed).toBe(true);
  });

  it.each(['admit', 'commit'] as const)('propagates injected higher-isolation serialization failure at %s without retry', async (failAt) => {
    const failure = Object.assign(new Error('could not serialize access due to concurrent update'), { code: '40001' });
    const m = model({ failAt, failure });
    const before = m.state();
    await expect(rotate(m)).rejects.toBe(failure);
    unchanged(m, before);
    expect(m.events.filter((event) => event === 'begin')).toHaveLength(1);
  });

  it('accepts uppercase UUID project and key inputs with lowercase database receipts', async () => {
    const creation = model({ keys: [] });
    await expect(create(creation, PROJECT.toUpperCase())).resolves.toHaveProperty('rawKey');
    const rotation = model();
    await expect(ApiKeyService.rotateApiKey(rotation.db, USER, KEY.toUpperCase())).resolves.toHaveProperty('rawKey');
    expect(rotation.calls[0]?.params).toEqual([KEY.toUpperCase(), USER]);
  });

  it('treats UUID case-only association changes as the same project', async () => {
    const m = model({ beforeLock: (state) => { state.keys[0]!.project_id = PROJECT.toUpperCase(); } });
    await expect(rotate(m)).resolves.toHaveProperty('rawKey');
    expect(m.events.filter((event) => event === 'admit')).toHaveLength(1);
  });

  it('does not case-fold the owner identity', async () => {
    const m = model();
    await expect(ApiKeyService.rotateApiKey(m.db, USER.toUpperCase(), KEY)).rejects.toMatchObject({ reason: 'not_found' });
    await expect(ApiKeyService.createApiKey(m.db, USER.toUpperCase(), 'Key', ['models:read'], null, PROJECT)).rejects.toThrow();
    expect(mocks.hash).not.toHaveBeenCalled();
  });

  it.each(['', 'malformed'])('rejects malformed create association %s before hashing or SQL', async (projectId) => {
    const m = model();
    await expect(create(m, projectId)).rejects.toThrow();
    expect(m.calls).toEqual([]);
    expect(mocks.hash).not.toHaveBeenCalled();
  });

  it('refuses a key revoked between discovery and locked reread', async () => {
    const m = model({ beforeLock: (state) => { state.keys[0]!.revoked_at = NOW.toISOString(); } });
    await expect(rotate(m)).rejects.toMatchObject({ reason: 'not_found' });
    expect(m.events).not.toContain('revoke');
    expect(m.events).not.toContain('insert');
  });

  it('uses valid changed metadata from the locked reread and filters retired permissions', async () => {
    const m = model({ beforeLock: (state) => {
      Object.assign(state.keys[0]!, { name: 'Current name', scopes: ['usage:read', 'retired:scope'], expires_at: null });
    } });
    expect((await rotate(m)).apiKey).toMatchObject({ name: 'Current name', scopes: ['usage:read'], expires_at: null });
  });

  it('archive after rotation revokes the replacement; rotation after archive refuses the old key', async () => {
    const first = model();
    const replacement = await rotate(first);
    expect((await archiveDeveloperProject(first.db, USER, PROJECT)).revokedKeyIds).toEqual([replacement.apiKey.id]);
    expect(first.state().keys.every((row) => row.revoked_at !== null)).toBe(true);
    const second = model();
    await archiveDeveloperProject(second.db, USER, PROJECT);
    const before = second.state();
    await expect(rotate(second)).rejects.toMatchObject({ reason: 'not_found' });
    unchanged(second, before);
  });
});
