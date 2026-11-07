import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hash: vi.fn(async (_raw: string) => 'fixture-argon2-hash'),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => {
    throw new Error('Rotation must use the supplied transaction adapter');
  }),
}));
vi.mock('argon2', () => ({
  default: { argon2id: 2, hash: mocks.hash, verify: vi.fn(async () => false) },
}));

import { API_KEY_SCOPE_VALUES } from '@/lib/api-key-scopes';
import { API_KEY_MAX_LIFETIME_DAYS_ENV } from '@/lib/services/api-key-service';
import { executeRegenerateApiKey } from '../executors/regenerate-api-key';

const USER = 'rotation-fixture-user';
const KEY_ID = '66666666-6666-4666-8666-666666666666';
const PROJECT_ID = '77777777-7777-4777-8777-777777777777';
const NOW = new Date('2026-11-05T12:00:00.000Z');
const EXPIRY = '2026-11-06T12:00:00.000Z';

interface StoredKey {
  id: string;
  user_id: string;
  name: string;
  scopes: string[] | null;
  expires_at?: unknown;
  project_id?: unknown;
  revoked_at: string | null;
  key_hash?: string;
  key_prefix?: string;
}

interface Call {
  sql: string;
  params: unknown[];
}

function seedKey(overrides: Partial<StoredKey> = {}): StoredKey {
  return {
    id: KEY_ID,
    user_id: USER,
    name: 'Deploy bot',
    scopes: ['inference:write', 'usage:read'],
    expires_at: EXPIRY,
    project_id: PROJECT_ID,
    revoked_at: null,
    ...overrides,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// In-memory staging checks routing/result timing, not SQL, locks or uncertain real commit outcomes.
function createTransactionModel(
  options: {
    row?: StoredKey | null;
    revokeCount?: number;
    insertFailure?: 'throw' | 'no_row';
    commitGate?: Promise<void>;
    commitFailure?: boolean;
    projectOwner?: string;
    projectArchived?: boolean;
    projectMissing?: boolean;
    lockedProject?: string | null;
  } = {},
) {
  let committed = options.row === null ? [] : [seedKey(options.row)];
  const outerCalls: Call[] = [];
  const txCalls: Call[] = [];
  const events: string[] = [];
  const callbackDone = deferred();

  const outerSql = async (sql: string, params: unknown[] = []): Promise<never> => {
    outerCalls.push({ sql, params });
    throw new Error('Rotation SQL escaped the transaction adapter');
  };
  const forbiddenScopeChange = (): never => {
    throw new Error('Rotation must retain the supplied scope');
  };
  const adapter: DatabaseAdapter = {
    query: outerSql,
    execute: outerSql,
    withUser: forbiddenScopeChange,
    withOrg: forbiddenScopeChange,
    dispose: async () => {},
    transaction: async <T>(run: (tx: DatabaseAdapter) => Promise<T>): Promise<T> => {
      events.push('begin');
      const staged = structuredClone(committed);
      const tx: DatabaseAdapter = {
        query: async <Row>(sql: string, params: unknown[] = []): Promise<Row[]> => {
          const normalized = sql.replace(/\s+/gu, ' ').trim();
          txCalls.push({ sql: normalized, params });
          if (
            /^select id, name, scopes, expires_at, project_id from public\.api_keys /iu.test(
              normalized,
            )
          ) {
            const locked = normalized.endsWith(' for update');
            expect(normalized).toBe(
              `select id, name, scopes, expires_at, project_id from public.api_keys where id = $1 and user_id = $2 and revoked_at is null limit 2${locked ? ' for update' : ''}`,
            );
            events.push(locked ? 'locked_read' : 'discovery');
            const rows = staged.filter(
              (row) => row.id === params[0] && row.user_id === params[1] && row.revoked_at === null,
            );
            return rows.map((row) => ({
              ...row,
              project_id:
                locked && options.lockedProject !== undefined
                  ? options.lockedProject
                  : row.project_id,
            })) as unknown as Row[];
          }
          if (
            normalized ===
            'update public.developer_projects set updated_at = now() where id = $1 and user_id = $2 and archived_at is null returning id'
          ) {
            events.push('project_write');
            return !options.projectMissing &&
              !options.projectArchived &&
              params[0] === PROJECT_ID &&
              params[1] === (options.projectOwner ?? USER)
              ? ([{ id: PROJECT_ID }] as unknown as Row[])
              : [];
          }
          if (/^insert into api_keys /iu.test(normalized)) {
            events.push('insert');
            if (options.insertFailure === 'throw') throw new Error('fixture insert failure');
            if (options.insertFailure === 'no_row') return [];
            const row: StoredKey = {
              id: '88888888-8888-4888-8888-888888888888',
              user_id: params[0] as string,
              name: params[1] as string,
              key_hash: params[2] as string,
              key_prefix: params[3] as string,
              scopes: params[4] as string[],
              expires_at: params[5],
              project_id: params[6],
              revoked_at: null,
            };
            staged.push(row);
            return [row] as unknown as Row[];
          }
          throw new Error(`Unexpected transaction query: ${normalized}`);
        },
        execute: async (sql: string, params: unknown[] = []): Promise<number> => {
          const normalized = sql.replace(/\s+/gu, ' ').trim();
          txCalls.push({ sql: normalized, params });
          if (
            normalized !==
            'UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL'
          ) {
            throw new Error(`Unexpected transaction mutation: ${normalized}`);
          }
          events.push('revoke');
          if (options.revokeCount !== undefined) return options.revokeCount;
          const row = staged.find(
            (key) => key.id === params[0] && key.user_id === params[1] && key.revoked_at === null,
          );
          if (!row) return 0;
          row.revoked_at = NOW.toISOString();
          return 1;
        },
        transaction: async () => {
          throw new Error('Unexpected nested transaction');
        },
        withUser: forbiddenScopeChange,
        withOrg: forbiddenScopeChange,
        dispose: async () => {},
      };
      try {
        const result = await run(tx);
        events.push('callback_done');
        callbackDone.resolve();
        if (options.commitGate) await options.commitGate;
        if (options.commitFailure) throw new Error('fixture commit failure');
        committed = staged;
        events.push('commit');
        return result;
      } catch (error) {
        events.push('rollback');
        throw error;
      }
    },
  };
  return {
    adapter,
    outerCalls,
    txCalls,
    events,
    callbackDone: callbackDone.promise,
    committed: () => structuredClone(committed),
    rotate: () => executeRegenerateApiKey({ db: adapter, userId: USER, keyId: KEY_ID }),
  };
}

describe('API key rotation transaction model (not a database concurrency test)', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
    vi.stubEnv(API_KEY_MAX_LIFETIME_DAYS_ENV, '30');
    mocks.hash.mockReset().mockResolvedValue('fixture-argon2-hash');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([EXPIRY, new Date(EXPIRY), null])(
    'preserves expiry %s and the project, name and scopes through canonical issuance',
    async (expiry) => {
      const model = createTransactionModel({ row: seedKey({ expires_at: expiry }) });
      const result = await model.rotate();

      expect(model.outerCalls).toEqual([]);
      expect(model.events).toEqual([
        'begin',
        'discovery',
        'project_write',
        'locked_read',
        'revoke',
        'insert',
        'callback_done',
        'commit',
      ]);
      expect(model.txCalls[0]).toEqual({
        sql: 'select id, name, scopes, expires_at, project_id from public.api_keys where id = $1 and user_id = $2 and revoked_at is null limit 2',
        params: [KEY_ID, USER],
      });
      expect(model.txCalls[1]?.params).toEqual([PROJECT_ID, USER]);
      expect(model.txCalls[2]?.params).toEqual([KEY_ID, USER]);
      expect(model.txCalls[3]?.params).toEqual([KEY_ID, USER]);
      const insert = model.txCalls[4]!;
      expect(insert.params).toEqual([
        USER,
        'Deploy bot',
        'fixture-argon2-hash',
        expect.stringMatching(/^[0-9a-f]{16}$/u),
        ['inference:write', 'usage:read'],
        expiry === null ? null : EXPIRY,
        PROJECT_ID,
      ]);
      expect(model.committed()[0]?.revoked_at).toBe(NOW.toISOString());
      expect(model.committed()).toHaveLength(2);
      expect(result.kind).toBe('secret_once');
      if (result.kind !== 'secret_once') throw new Error('Expected one-time secret');
      expect(result.fullKey).toMatch(/^sk_live_[0-9a-f]{16}_[0-9a-f]{48}$/u);
      expect(result.doNotPersist).toBe(true);
      expect(result.apiKey).toEqual({
        id: model.committed()[1]?.id,
        name: 'Deploy bot',
        keyPrefix: insert.params[3],
      });
      expect(mocks.hash).toHaveBeenCalledWith(result.fullKey, expect.objectContaining({ type: 2 }));
      expect(JSON.stringify(model.committed())).not.toContain(result.fullKey);
      expect(JSON.stringify(model.txCalls)).not.toContain(result.fullKey);
    },
  );

  it.each([
    ['null legacy scopes', null, [...API_KEY_SCOPE_VALUES]],
    ['empty legacy scopes', [], [...API_KEY_SCOPE_VALUES]],
    ['mixed unknown scopes', ['legacy:unknown', 'usage:read'], ['usage:read']],
  ] as const)('retains resolver semantics for %s', async (_label, scopes, expected) => {
    const model = createTransactionModel({
      row: seedKey({ scopes: scopes === null ? null : [...scopes], project_id: null }),
    });
    await model.rotate();
    expect(model.committed()[1]?.scopes).toEqual(expected);
    expect(model.committed()[1]?.project_id).toBeNull();
    expect(model.outerCalls).toEqual([]);
    expect(model.events).toEqual([
      'begin',
      'discovery',
      'locked_read',
      'revoke',
      'insert',
      'callback_done',
      'commit',
    ]);
  });

  it.each([
    ['invalid expiry', { expires_at: 'not-a-date' }],
    ['invalid Date', { expires_at: new Date(Number.NaN) }],
    ['expired expiry', { expires_at: '2026-11-04T12:00:00.000Z' }],
    ['expiry exactly now', { expires_at: NOW }],
    ['over-limit expiry', { expires_at: '2026-12-06T12:00:00.000Z' }],
    ['missing expiry', { expires_at: undefined }],
    ['numeric expiry', { expires_at: NOW.getTime() + 1000 }],
    ['malformed project', { project_id: 'not-a-uuid' }],
    ['missing project', { project_id: undefined }],
    ['non-string project', { project_id: 123 }],
    ['unsupported scopes', { scopes: ['legacy:unknown'] }],
  ] satisfies Array<[string, Partial<StoredKey>]>)(
    'refuses %s before revocation',
    async (_label, overrides) => {
      const model = createTransactionModel({ row: seedKey(overrides) });
      const before = model.committed();
      await expect(model.rotate()).rejects.toMatchObject({
        code: 'SUPPORT_ACTION_UNAVAILABLE',
        status: 409,
      });
      const invalidProject = Object.hasOwn(overrides, 'project_id');
      expect(model.events).toEqual(
        invalidProject
          ? ['begin', 'discovery', 'rollback']
          : ['begin', 'discovery', 'project_write', 'locked_read', 'rollback'],
      );
      expect(model.txCalls).toHaveLength(invalidProject ? 1 : 3);
      expect(model.outerCalls).toEqual([]);
      expect(mocks.hash).not.toHaveBeenCalled();
      expect(model.committed()).toEqual(before);
    },
  );

  it.each([
    ['absent', null],
    ['other owner', seedKey({ user_id: 'another-user' })],
    ['already revoked', seedKey({ revoked_at: NOW.toISOString() })],
  ] as const)('refuses an %s target without mutation', async (_label, row) => {
    const model = createTransactionModel({ row });
    await expect(model.rotate()).rejects.toMatchObject({
      code: 'SUPPORT_ACTION_TARGET_NOT_FOUND',
      status: 404,
    });
    expect(model.events).toEqual(['begin', 'discovery', 'rollback']);
    expect(model.outerCalls).toEqual([]);
    expect(mocks.hash).not.toHaveBeenCalled();
  });

  it.each([0, 2])('requires exactly one revoked row, not %s', async (revokeCount) => {
    const model = createTransactionModel({ revokeCount });
    await expect(model.rotate()).rejects.toMatchObject({
      code: 'SUPPORT_ACTION_TARGET_NOT_FOUND',
      status: 409,
    });
    expect(model.events).toEqual([
      'begin',
      'discovery',
      'project_write',
      'locked_read',
      'revoke',
      'rollback',
    ]);
    expect(model.committed()).toEqual([seedKey()]);
    expect(model.outerCalls).toEqual([]);
    expect(mocks.hash).not.toHaveBeenCalled();
  });

  it.each([{ projectMissing: true }, { projectArchived: true }, { projectOwner: 'another-user' }])(
    'refuses an unavailable associated project: %s',
    async (options) => {
      const model = createTransactionModel(options);
      await expect(model.rotate()).rejects.toMatchObject({
        code: 'SUPPORT_ACTION_UNAVAILABLE',
        status: 409,
      });
      expect(model.events).toEqual(['begin', 'discovery', 'project_write', 'rollback']);
      expect(model.committed()).toEqual([seedKey()]);
      expect(mocks.hash).not.toHaveBeenCalled();
    },
  );

  it.each([null, '99999999-9999-4999-8999-999999999999'])(
    'refuses a changed locked project %s',
    async (lockedProject) => {
      const model = createTransactionModel({ lockedProject });
      await expect(model.rotate()).rejects.toMatchObject({
        code: 'SUPPORT_ACTION_TARGET_NOT_FOUND',
        status: 409,
      });
      expect(model.events).toEqual([
        'begin',
        'discovery',
        'project_write',
        'locked_read',
        'rollback',
      ]);
      expect(model.committed()).toEqual([seedKey()]);
      expect(mocks.hash).not.toHaveBeenCalled();
    },
  );

  it('does not silently deduplicate scopes that the canonical issuer refuses', async () => {
    const row = seedKey({ scopes: ['usage:read', 'usage:read'] });
    const model = createTransactionModel({ row });
    await expect(model.rotate()).rejects.toMatchObject({
      code: 'SUPPORT_ACTION_UNAVAILABLE',
      status: 409,
    });
    expect(model.events).toEqual([
      'begin',
      'discovery',
      'project_write',
      'locked_read',
      'rollback',
    ]);
    expect(model.committed()).toEqual([row]);
    expect(model.outerCalls).toEqual([]);
    expect(mocks.hash).not.toHaveBeenCalled();
  });

  it.each(['hash', 'throw', 'no_row', 'commit'] as const)(
    'models a known-uncommitted %s failure without returning a secret',
    async (failure) => {
      if (failure === 'hash') mocks.hash.mockRejectedValueOnce(new Error('fixture hash failure'));
      const model = createTransactionModel({
        insertFailure: failure === 'throw' || failure === 'no_row' ? failure : undefined,
        commitFailure: failure === 'commit',
      });
      const expose = vi.fn();
      await expect(model.rotate().then(expose)).rejects.toThrow();
      expect(expose).not.toHaveBeenCalled();
      expect(model.events).toContain('revoke');
      expect(model.events.at(-1)).toBe('rollback');
      expect(model.events).not.toContain('commit');
      expect(model.committed()).toEqual([seedKey()]);
      expect(model.outerCalls).toEqual([]);
    },
  );

  it('does not expose the result while the transaction callback has finished but commit is pending', async () => {
    const gate = deferred();
    const model = createTransactionModel({ commitGate: gate.promise });
    const expose = vi.fn();
    const pending = model.rotate().then((result) => {
      expose(result);
      return result;
    });
    await Promise.race([model.callbackDone, pending]);
    try {
      expect(model.events.at(-1)).toBe('callback_done');
      expect(model.committed()).toEqual([seedKey()]);
      expect(expose).not.toHaveBeenCalled();
    } finally {
      gate.resolve();
    }
    const result = await pending;
    expect(model.events.at(-1)).toBe('commit');
    expect(expose).toHaveBeenCalledOnce();
    expect(result.kind).toBe('secret_once');
    expect(model.committed()).toHaveLength(2);
  });
});
