import type { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataLayerConfigError,
  type DatabaseAdapter,
  type DatabaseConnectionErrorEvent,
} from '../types';

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
  pools: EventEmitter[];
  clients: EventEmitter[];
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
  pools: [],
  clients: [],
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
  state.pools = [];
  state.clients = [];
});

vi.mock('@neondatabase/serverless', async () => {
  const { EventEmitter: NodeEventEmitter } = await import('node:events');
  class MockClient extends NodeEventEmitter {
    async query(sql: string, params?: unknown[]) {
      state.clientCalls.push({ sql, ...(params !== undefined ? { params } : {}) });
      return state.clientQueryHandler(sql, params);
    }
    release() {
      state.released += 1;
    }
  }
  class MockPool extends NodeEventEmitter {
    constructor(config: unknown) {
      super();
      state.poolConstructions += 1;
      state.lastPoolConfig = config;
      state.pools.push(this);
    }
    async query(sql: string, params?: unknown[]) {
      state.poolCalls.push({ sql, ...(params !== undefined ? { params } : {}) });
      return state.poolQueryHandler(sql, params);
    }
    async connect() {
      const client = new MockClient();
      state.clients.push(client);
      this.emit('connect', client);
      return client;
    }
    async end() {
      state.ended += 1;
    }
  }
  return { Pool: MockPool, neonConfig: { poolQueryViaFetch: false } };
});

const { NeonDatabaseAdapter } = await import('../adapters/neon');

afterEach(() => {
  vi.clearAllMocks();
});

function findClientCall(fragment: string): Call | undefined {
  return state.clientCalls.find((c) => c.sql.includes(fragment));
}

function boundClaims(): { sub: unknown; org: unknown } | undefined {
  const call = findClientCall("set_config('request.jwt.claim.sub'");
  if (!call?.params) return undefined;
  return { sub: call.params[0], org: call.params[1] };
}

function makeJwt(payload: Record<string, unknown>): string {
  const b64u = (s: string) =>
    Buffer.from(s, 'utf8')
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  return `${b64u('{"alg":"HS256","typ":"JWT"}')}.${b64u(JSON.stringify(payload))}.sig`;
}

describe('NeonDatabaseAdapter pool configuration', () => {
  it('always bounds connection acquisition so a dead socket cannot hang forever', async () => {
    state.poolQueryHandler = async () => ({ rows: [], rowCount: 0 });
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    await adapter.query('select 1');
    expect(state.lastPoolConfig).toMatchObject({
      connectionTimeoutMillis: expect.any(Number),
    });
    expect(
      (state.lastPoolConfig as { connectionTimeoutMillis: number }).connectionTimeoutMillis,
    ).toBeGreaterThan(0);
  });

  it('forwards every declared timeout and application name to the driver', async () => {
    state.poolQueryHandler = async () => ({ rows: [], rowCount: 0 });
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
      connectionTimeoutMs: 1_234,
      statementTimeoutMs: 5_678,
      queryTimeoutMs: 9_012,
      applicationName: 'agi-test',
    });
    await adapter.query('select 1');
    expect(state.lastPoolConfig).toMatchObject({
      connectionTimeoutMillis: 1_234,
      statement_timeout: 5_678,
      query_timeout: 9_012,
      application_name: 'agi-test',
    });
  });
});

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
    expect(captured[0]).not.toBe(adapter);
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
      unsafeAllowUnverifiedJwtSubject: true,
    });
    const scoped = adapter.withUser(makeJwt({ sub: 'user-42' }));
    await scoped.transaction(async (tx) => {
      await tx.execute('update profiles set name = $1', ['Ada']);
      return null;
    });
    expect(boundClaims()?.sub).toBe('user-42');
    expect(findClientCall('SET LOCAL ROLE app_rls')).toBeDefined();
  });
});

describe('NeonDatabaseAdapter.withUser — UNVERIFIED-JWT default-deny (P1-DATALAYER-JWT)', () => {
  it('THROWS by default — refuses an attacker-influenced JWT when no opt-in flag is set', () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
      // unsafeAllowUnverifiedJwtSubject intentionally NOT set → default-deny.
    });
    const forged = makeJwt({ sub: 'victim-admin-user' });
    expect(() => adapter.withUser(forged)).toThrow(DataLayerConfigError);
    expect(() => adapter.withUser(forged)).toThrow(/unsafeAllowUnverifiedJwtSubject/);
  });

  it('default-deny throws BEFORE decoding — no pool client is ever checked out', async () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    expect(() => adapter.withUser(makeJwt({ sub: 'attacker' }))).toThrow(DataLayerConfigError);
    const setLocal = state.clientCalls.find((c) =>
      c.sql.includes("set_config('request.jwt.claim.sub'"),
    );
    expect(setLocal).toBeUndefined();
  });

  it('opt-in is required even for a well-formed token (the flag, not the token, gates)', () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    expect(() => adapter.withUser(makeJwt({ sub: 'well-formed' }))).toThrow(
      /verify the token signature upstream|Verify the token signature upstream/i,
    );
  });

  it('binds the decoded sub once the integrator opts in (verified-upstream path)', async () => {
    state.clientQueryHandler = async (sql) =>
      sql.toLowerCase().startsWith('select')
        ? { rows: [{ id: 7 }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
      unsafeAllowUnverifiedJwtSubject: true,
    });
    const scoped = adapter.withUser(makeJwt({ sub: 'user-abc' }));
    const rows = await scoped.query<{ id: number }>('select id from t');
    expect(rows).toEqual([{ id: 7 }]);
    expect(boundClaims()?.sub).toBe('user-abc');
  });

  it('propagates the opt-in flag to the withUser child so nested binding still works', async () => {
    state.clientQueryHandler = async (sql) =>
      sql.toLowerCase().startsWith('select')
        ? { rows: [{ id: 1 }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
      unsafeAllowUnverifiedJwtSubject: true,
    });
    const scoped = adapter.withUser(makeJwt({ sub: 'u-1' }));
    expect(() => (scoped as NeonDatabaseAdapter).withUser(makeJwt({ sub: 'u-2' }))).not.toThrow();
  });
});

describe('NeonDatabaseAdapter.withUser', () => {
  it('returns a NEW adapter instance (immutable)', () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
      unsafeAllowUnverifiedJwtSubject: true,
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
      unsafeAllowUnverifiedJwtSubject: true,
    });
    const scoped = adapter.withUser(makeJwt({ sub: 'user-abc' }));
    const rows = await scoped.query<{ id: number }>('select id from t');
    expect(rows).toEqual([{ id: 7 }]);
    expect(boundClaims()?.sub).toBe('user-abc');
    expect(findClientCall('SET LOCAL ROLE app_rls')).toBeDefined();
  });

  it('throws DataLayerConfigError when the JWT is malformed', () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
      unsafeAllowUnverifiedJwtSubject: true,
    });
    expect(() => adapter.withUser('not-a-jwt')).toThrow(/3-segment JWT/);
  });

  it('throws when JWT has no sub claim', () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
      unsafeAllowUnverifiedJwtSubject: true,
    });
    expect(() => adapter.withUser(makeJwt({ name: 'Ada' }))).toThrow(/no string `sub` claim/);
  });
});

describe('NeonDatabaseAdapter.withOrg — tenancy scope (migration 0073)', () => {
  const makeAdapter = () =>
    new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
      unsafeAllowUnverifiedJwtSubject: true,
    });

  it('returns a NEW adapter and leaves the receiver unscoped', () => {
    const adapter = makeAdapter();
    const scoped = adapter.withOrg('11111111-1111-4111-8111-111111111111');
    expect(scoped).not.toBe(adapter);
    expect(scoped).toBeInstanceOf(NeonDatabaseAdapter);
  });

  it('binds the active organization on every scoped query', async () => {
    state.clientQueryHandler = async (sql) =>
      sql.toLowerCase().startsWith('select')
        ? { rows: [{ id: 1 }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    const scoped = makeAdapter()
      .withUser(makeJwt({ sub: 'user-abc' }))
      .withOrg('22222222-2222-4222-8222-222222222222');
    await scoped.query('select id from t');
    expect(boundClaims()?.org).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('composes in either order without changing the resulting scope', async () => {
    state.clientQueryHandler = async () => ({ rows: [], rowCount: 0 });
    const org = '33333333-3333-4333-8333-333333333333';
    const jwt = makeJwt({ sub: 'user-xyz' });

    await makeAdapter().withUser(jwt).withOrg(org).query('select 1');
    const first = boundClaims();

    state.clientCalls.length = 0;
    await makeAdapter().withOrg(org).withUser(jwt).query('select 1');
    const second = boundClaims();

    expect(first).toEqual({ sub: 'user-xyz', org });
    expect(second).toEqual(first);
  });

  it('always binds the org GUC, so a pooled connection cannot inherit a previous request scope', async () => {
    state.clientQueryHandler = async () => ({ rows: [], rowCount: 0 });
    await makeAdapter()
      .withUser(makeJwt({ sub: 'user-abc' }))
      .query('select 1');
    expect(findClientCall("set_config('request.jwt.claim.org_id'")).toBeDefined();
    expect(boundClaims()?.org).toBe('');
  });

  it('clears the organization when passed null', async () => {
    state.clientQueryHandler = async () => ({ rows: [], rowCount: 0 });
    const scoped = makeAdapter()
      .withUser(makeJwt({ sub: 'user-abc' }))
      .withOrg('44444444-4444-4444-8444-444444444444')
      .withOrg(null);
    await scoped.query('select 1');
    expect(boundClaims()?.org).toBe('');
  });

  it('refuses to rebind tenancy inside an open transaction', async () => {
    state.clientQueryHandler = async () => ({ rows: [], rowCount: 0 });
    const adapter = makeAdapter().withUser(makeJwt({ sub: 'user-abc' }));
    await expect(
      adapter.transaction(async (tx) => {
        tx.withOrg('55555555-5555-4555-8555-555555555555');
        return null;
      }),
    ).rejects.toThrow(/BEFORE opening a/);
  });
});

describe('NeonDatabaseAdapter RLS preamble round trips', () => {
  const makeScoped = () =>
    new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
      unsafeAllowUnverifiedJwtSubject: true,
    }).withUser(makeJwt({ sub: 'user-abc' }));

  it('sends 4 statements for a user-scoped read', async () => {
    state.clientQueryHandler = async () => ({ rows: [], rowCount: 0 });
    await makeScoped().query('select id from t');
    expect(state.clientCalls.map((c) => c.sql)).toEqual([
      'BEGIN; SET LOCAL ROLE app_rls',
      "SELECT set_config('request.jwt.claim.sub', $1, true), " +
        "set_config('request.jwt.claim.org_id', $2, true)",
      'select id from t',
      'COMMIT',
    ]);
  });

  it('sends 4 statements for a user-scoped write', async () => {
    state.clientQueryHandler = async () => ({ rows: [], rowCount: 1 });
    const n = await makeScoped().execute('update profiles set name = $1', ['Ada']);
    expect(n).toBe(1);
    expect(state.clientCalls).toHaveLength(4);
  });

  it('batches the role switch ahead of the caller query, not alongside it', async () => {
    state.clientQueryHandler = async () => ({ rows: [], rowCount: 0 });
    await makeScoped().query('select id from t');
    const sqls = state.clientCalls.map((c) => c.sql);
    expect(sqls.findIndex((s) => s.includes('SET LOCAL ROLE app_rls'))).toBeLessThan(
      sqls.indexOf('select id from t'),
    );
  });

  it('leaves the unscoped transaction preamble at a bare BEGIN', async () => {
    state.clientQueryHandler = async () => ({ rows: [], rowCount: 0 });
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    await adapter.transaction(async () => null);
    expect(state.clientCalls.map((c) => c.sql)).toEqual(['BEGIN', 'COMMIT']);
  });
});

describe('NeonDatabaseAdapter.dispose', () => {
  it('calls pool.end() on first dispose and is safe to call twice', async () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
    });
    await adapter.query('select 1');
    expect(state.poolConstructions).toBe(1);
    await adapter.dispose();
    expect(state.ended).toBe(1);
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

describe('NeonDatabaseAdapter pool sharing (P0-J)', () => {
  it('100x withUser shares a single Pool — does not reconstruct per request', async () => {
    state.poolQueryHandler = async () => ({ rows: [{ id: 1 }], rowCount: 1 });
    state.clientQueryHandler = async (sql) =>
      sql.toLowerCase().startsWith('select')
        ? { rows: [{ id: 1 }], rowCount: 1 }
        : { rows: [], rowCount: 0 };

    const root = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
      unsafeAllowUnverifiedJwtSubject: true,
    });

    await root.query('select 1');
    expect(state.poolConstructions).toBe(1);

    for (let i = 0; i < 100; i++) {
      const scoped = root.withUser(makeJwt({ sub: `u-${i}` }));
      const rows = await scoped.query<{ id: number }>('select id from x');
      expect(rows).toEqual([{ id: 1 }]);
    }

    expect(state.poolConstructions).toBe(1);
  });

  it('disposing a child (withUser) does NOT end the shared pool', async () => {
    state.clientQueryHandler = async (sql) =>
      sql.toLowerCase().startsWith('select')
        ? { rows: [{ id: 1 }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    const root = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
      unsafeAllowUnverifiedJwtSubject: true,
    });
    await root.query('select 1');
    const child = root.withUser(makeJwt({ sub: 'c1' }));
    await child.dispose();
    expect(state.ended).toBe(0);
    const rows = await root.query('select 1');
    expect(rows).toBeDefined();
    await root.dispose();
    expect(state.ended).toBe(1);
  });

  it('child created from withUser rejects on its own query after child dispose', async () => {
    const root = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db',
      unsafeAllowUnverifiedJwtSubject: true,
    });
    const child = root.withUser(makeJwt({ sub: 'c1' }));
    await child.dispose();
    await expect(child.query('select 1')).rejects.toThrow(/disposed/);
  });
});

describe('NeonDatabaseAdapter constructor / raw', () => {
  it('does NOT open the pool at construction time', () => {
    new NeonDatabaseAdapter({ connectionString: 'postgresql://u:p@ep.neon.tech/db' });
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
    expect(typeof (pool as { connect?: unknown }).connect).toBe('function');
    expect(typeof (pool as { end?: unknown }).end).toBe('function');
  });
});

describe('NeonDatabaseAdapter connection transport errors', () => {
  const CONNECTION_STRING = 'postgresql://u:p@ep.neon.tech/db';

  async function warmedAdapter(events: DatabaseConnectionErrorEvent[]) {
    const adapter = new NeonDatabaseAdapter({
      connectionString: CONNECTION_STRING,
      applicationName: 'agi-web',
      onConnectionError: (event) => events.push(event),
    });
    await adapter.query('select 1');
    return adapter;
  }

  it('reports an idle-connection failure instead of letting the pool emit throw', async () => {
    const events: DatabaseConnectionErrorEvent[] = [];
    await warmedAdapter(events);
    const error = new Error('write EPIPE');

    expect(() => state.pools[0]?.emit('error', error)).not.toThrow();
    expect(events).toEqual([{ scope: 'pool', applicationName: 'agi-web', error }]);
  });

  it('reports a failure on a checked-out client, which the pool leaves unguarded', async () => {
    const events: DatabaseConnectionErrorEvent[] = [];
    const adapter = await warmedAdapter(events);
    await adapter.transaction(async () => null);
    const error = new Error('socket hang up');

    expect(() => state.clients[0]?.emit('error', error)).not.toThrow();
    expect(events).toEqual([{ scope: 'client', applicationName: 'agi-web', error }]);
  });

  it('reports the driver ErrorEvent shape, which is not an Error at all', async () => {
    const events: DatabaseConnectionErrorEvent[] = [];
    await warmedAdapter(events);
    const errorEvent = { type: 'error' };

    expect(() => state.pools[0]?.emit('error', errorEvent)).not.toThrow();
    expect(events[0]?.error).toBe(errorEvent);
  });

  it('reports one idle failure once, not twice as it travels client then pool', async () => {
    const events: DatabaseConnectionErrorEvent[] = [];
    const adapter = await warmedAdapter(events);
    await adapter.transaction(async () => null);
    const error = new Error('connection terminated unexpectedly');

    state.clients[0]?.emit('error', error);
    state.pools[0]?.emit('error', error);

    expect(events).toEqual([{ scope: 'client', applicationName: 'agi-web', error }]);
  });

  it('falls back to console rather than dropping the failure when nothing is wired', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const adapter = new NeonDatabaseAdapter({ connectionString: CONNECTION_STRING });
    await adapter.query('select 1');

    expect(() => state.pools[0]?.emit('error', new Error('reset by peer'))).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('survives a reporter that throws, so logging cannot become the crash', async () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: CONNECTION_STRING,
      onConnectionError: () => {
        throw new Error('logger transport is down');
      },
    });
    await adapter.query('select 1');

    expect(() => state.pools[0]?.emit('error', new Error('reset by peer'))).not.toThrow();
  });

  it('guards a pool the withUser child inherits rather than reattaching per scope', async () => {
    const events: DatabaseConnectionErrorEvent[] = [];
    const adapter = new NeonDatabaseAdapter({
      connectionString: CONNECTION_STRING,
      unsafeAllowUnverifiedJwtSubject: true,
      onConnectionError: (event) => events.push(event),
    });
    await adapter.query('select 1');
    await adapter.withUser(makeJwt({ sub: 'user-42' })).query('select 1');
    const error = new Error('write EPIPE');

    expect(state.poolConstructions).toBe(1);
    state.pools[0]?.emit('error', error);
    expect(events).toEqual([{ scope: 'pool', error }]);
  });
});
