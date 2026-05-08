/**
 * NeonDatabaseAdapter unit tests.
 *
 * `@neondatabase/serverless` is mocked via `vi.mock` — we never open a
 * real socket. The mock surfaces just enough of the `Pool` / `PoolClient`
 * API for the adapter to drive its codepaths:
 *
 *   - `pool.query(sql, params)` returns `{ rows, rowCount }`.
 *   - `pool.connect()` returns a `PoolClient` whose `.query()` records
 *     every call (so we can assert BEGIN / SET LOCAL / COMMIT / ROLLBACK).
 *   - `pool.end()` resolves so `dispose()` is observable.
 *
 * The mock is reset between tests so each test gets a fresh call log.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '../types';

// ---------------------------------------------------------------------------
// Mock state — visible to both the mock factory and the assertions.
// ---------------------------------------------------------------------------
type Call = { sql: string; params?: unknown[] };
type QueryResp = { rows: unknown[]; rowCount: number | null };

interface MockState {
  poolQueryHandler: (sql: string, params?: unknown[]) => Promise<QueryResp>;
  clientQueryHandler: (sql: string, params?: unknown[]) => Promise<QueryResp>;
  poolCalls: Call[];
  clientCalls: Call[];
  released: number;
  ended: number;
  poolConstructions: number;
  lastPoolConfig: unknown;
}

const state: MockState = {
  poolQueryHandler: async () => ({ rows: [], rowCount: 0 }),
  clientQueryHandler: async () => ({ rows: [], rowCount: 0 }),
  poolCalls: [],
  clientCalls: [],
  released: 0,
  ended: 0,
  poolConstructions: 0,
  lastPoolConfig: undefined,
};

beforeEach(() => {
  state.poolQueryHandler = async () => ({ rows: [], rowCount: 0 });
  state.clientQueryHandler = async () => ({ rows: [], rowCount: 0 });
  state.poolCalls = [];
  state.clientCalls = [];
  state.released = 0;
  state.ended = 0;
  state.poolConstructions = 0;
  state.lastPoolConfig = undefined;
});

// ---------------------------------------------------------------------------
// Mock the driver module. `vi.mock` factories must not capture mutable
// outer state, so the mock reads `state` by reference inside the methods —
// every call to the methods re-reads the latest handler.
// ---------------------------------------------------------------------------
vi.mock('@neondatabase/serverless', () => {
  class MockPool {
    constructor(config: unknown) {
      state.poolConstructions += 1;
      state.lastPoolConfig = config;
    }
    async query(sql: string, params?: unknown[]) {
      state.poolCalls.push({ sql, ...(params !== undefined ? { params } : {}) });
      return state.poolQueryHandler(sql, params);
    }
    async connect() {
      return {
        query: async (sql: string, params?: unknown[]) => {
          state.clientCalls.push({ sql, ...(params !== undefined ? { params } : {}) });
          return state.clientQueryHandler(sql, params);
        },
        release: () => {
          state.released += 1;
        },
      };
    }
    async end() {
      state.ended += 1;
    }
  }
  return { Pool: MockPool };
});

// IMPORTANT: import the adapter AFTER vi.mock is registered.
const { NeonDatabaseAdapter } = await import('../adapters/neon');

afterEach(() => {
  vi.clearAllMocks();
});

// Helper: a JWT with a known `sub` claim. Header / signature are dummy —
// we never verify, we just decode the middle segment.
function makeJwt(payload: Record<string, unknown>): string {
  const b64u = (s: string) =>
    Buffer.from(s, 'utf8')
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  return `${b64u('{"alg":"HS256","typ":"JWT"}')}.${b64u(JSON.stringify(payload))}.sig`;
}

describe('NeonDatabaseAdapter.query', () => {
  it('passes sql + params to pool.query and returns rows', async () => {
    state.poolQueryHandler = async () => ({ rows: [{ id: 'u1' }], rowCount: 1 });
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    const rows = await adapter.query<{ id: string }>('select id from users where id = $1', ['u1']);
    expect(rows).toEqual([{ id: 'u1' }]);
    expect(state.poolCalls).toEqual([
      { sql: 'select id from users where id = $1', params: ['u1'] },
    ]);
  });

  it('returns an empty array when pool.query returns no rows', async () => {
    state.poolQueryHandler = async () => ({ rows: [], rowCount: 0 });
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    const rows = await adapter.query('select 1');
    expect(rows).toEqual([]);
  });

  it('propagates errors thrown by pool.query', async () => {
    state.poolQueryHandler = async () => {
      throw new Error('connection refused');
    };
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    await expect(adapter.query('select 1')).rejects.toThrow('connection refused');
  });
});

describe('NeonDatabaseAdapter.execute', () => {
  it('returns rowCount from the QueryResult', async () => {
    state.poolQueryHandler = async () => ({ rows: [], rowCount: 5 });
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    const n = await adapter.execute('delete from sessions where expired = true');
    expect(n).toBe(5);
  });

  it('coerces null rowCount to 0', async () => {
    state.poolQueryHandler = async () => ({ rows: [], rowCount: null });
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    expect(await adapter.execute('create table t ()')).toBe(0);
  });
});

describe('NeonDatabaseAdapter.transaction', () => {
  it('wraps the callback in BEGIN / COMMIT and passes a sub-adapter', async () => {
    state.clientQueryHandler = async (sql) => {
      if (sql.toLowerCase().startsWith('select')) {
        return { rows: [{ id: 1 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    const captured: DatabaseAdapter[] = [];
    const result = await adapter.transaction(async (tx) => {
      captured.push(tx);
      const rows = await tx.query('select id from x');
      return rows.length;
    });
    expect(result).toBe(1);
    expect(captured).toHaveLength(1);
    expect(captured[0]).not.toBe(adapter); // sub-adapter, not outer
    const sqls = state.clientCalls.map((c) => c.sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
    expect(sqls).toContain('select id from x');
    expect(state.released).toBe(1);
  });

  it('ROLLBACKs and rethrows when the callback throws', async () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    await expect(
      adapter.transaction(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const sqls = state.clientCalls.map((c) => c.sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
    expect(state.released).toBe(1);
  });

  it('binds the JWT subject via SET LOCAL when withUser was called', async () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    const scoped = adapter.withUser(makeJwt({ sub: 'user-42' }));
    await scoped.transaction(async (tx) => {
      await tx.execute('update profiles set name = $1', ['Ada']);
      return null;
    });
    const setLocal = state.clientCalls.find((c) =>
      c.sql.startsWith('SET LOCAL request.jwt.claim.sub'),
    );
    expect(setLocal).toBeDefined();
    expect(setLocal?.params).toEqual(['user-42']);
  });
});

describe('NeonDatabaseAdapter.withUser', () => {
  it('returns a NEW adapter instance (immutable)', () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    const scoped = adapter.withUser(makeJwt({ sub: 'u-1' }));
    expect(scoped).not.toBe(adapter);
    expect(scoped).toBeInstanceOf(NeonDatabaseAdapter);
  });

  it('fires SET LOCAL with the decoded sub on every scoped query', async () => {
    state.clientQueryHandler = async (sql) =>
      sql.toLowerCase().startsWith('select')
        ? { rows: [{ id: 7 }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    const scoped = adapter.withUser(makeJwt({ sub: 'user-abc' }));
    const rows = await scoped.query<{ id: number }>('select id from t');
    expect(rows).toEqual([{ id: 7 }]);
    const setLocal = state.clientCalls.find((c) =>
      c.sql.startsWith('SET LOCAL request.jwt.claim.sub'),
    );
    expect(setLocal?.params).toEqual(['user-abc']);
  });

  it('throws DataLayerConfigError when the JWT is malformed', () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    expect(() => adapter.withUser('not-a-jwt')).toThrow(/3-segment JWT/);
  });

  it('throws when JWT has no sub claim', () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    expect(() => adapter.withUser(makeJwt({ name: 'Ada' }))).toThrow(/no string `sub` claim/);
  });
});

describe('NeonDatabaseAdapter.dispose', () => {
  it('calls pool.end() on first dispose and is safe to call twice', async () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    // Prime the pool by running a no-op query — otherwise the lazy
    // promise never resolves and we never construct.
    await adapter.query('select 1');
    expect(state.poolConstructions).toBe(1);
    await adapter.dispose();
    expect(state.ended).toBe(1);
    // Second dispose is a no-op (no second pool.end()).
    await adapter.dispose();
    expect(state.ended).toBe(1);
  });

  it('rejects subsequent queries after dispose', async () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    await adapter.dispose();
    await expect(adapter.query('select 1')).rejects.toThrow(/disposed/);
  });
});

describe('NeonDatabaseAdapter constructor / raw', () => {
  it('does NOT open the pool at construction time', () => {
    new NeonDatabaseAdapter({ connectionString: 'postgresql://u:p@ep.neon.tech/db' });
    // The lazy IIFE schedules construction asynchronously, but no
    // synchronous Pool() call has fired yet.
    expect(state.poolConstructions).toBe(0);
  });

  it('passes connectionString and poolSize through to the Pool constructor', async () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
      poolSize: 7,
    });
    await adapter.query('select 1');
    expect(state.poolConstructions).toBe(1);
    expect(state.lastPoolConfig).toMatchObject({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
      max: 7,
    });
  });

  it('raw() returns the underlying Pool typed as unknown', async () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    const pool = await adapter.raw();
    expect(pool).toBeDefined();
    // It must look like a Pool — connect / end / query are all present.
    expect(typeof (pool as { connect?: unknown }).connect).toBe('function');
    expect(typeof (pool as { end?: unknown }).end).toBe('function');
  });
});
