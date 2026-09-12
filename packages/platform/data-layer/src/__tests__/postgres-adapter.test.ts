import type { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseConnectionErrorEvent } from '../types';

type QueryResp = { rows: unknown[]; rowCount: number | null };

interface MockState {
  clients: EventEmitter[];
  released: number;
  /** Model a warm pool: every checkout hands back the SAME client object. */
  reusePooledClient: boolean;
}

const state: MockState = {
  clients: [],
  released: 0,
  reusePooledClient: false,
};

beforeEach(() => {
  state.clients = [];
  state.released = 0;
  state.reusePooledClient = false;
});

vi.mock('pg', async () => {
  const { EventEmitter: NodeEventEmitter } = await import('node:events');
  class MockClient extends NodeEventEmitter {
    async query(): Promise<QueryResp> {
      return { rows: [], rowCount: 0 };
    }
    release() {
      state.released += 1;
    }
  }
  class MockPool extends NodeEventEmitter {
    async query(): Promise<QueryResp> {
      return { rows: [], rowCount: 0 };
    }
    async connect() {
      const reused = state.reusePooledClient ? state.clients[0] : undefined;
      if (reused) return reused;
      const client = new MockClient();
      state.clients.push(client);
      return client;
    }
    async end() {}
  }
  return { default: { Pool: MockPool }, Pool: MockPool };
});

const { PostgresDatabaseAdapter } = await import('../adapters/postgres');

const CONNECTION_STRING = 'postgresql://u:p@localhost:5432/db';

function makeJwt(payload: Record<string, unknown>): string {
  const b64u = (s: string) =>
    Buffer.from(s, 'utf8')
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  return `${b64u('{"alg":"HS256","typ":"JWT"}')}.${b64u(JSON.stringify(payload))}.sig`;
}

function scopedAdapter(events: DatabaseConnectionErrorEvent[]) {
  return new PostgresDatabaseAdapter({
    connectionString: CONNECTION_STRING,
    unsafeAllowUnverifiedJwtSubject: true,
    onConnectionError: (event) => events.push(event),
  });
}

/**
 * AGI-31. The same leak the Neon adapter carried, in the adapter that serves a
 * plain Postgres. `getUserScopedDb` derives a fresh adapter per request through
 * `withUser().withOrg()`, all sharing one pool, so a client guard that was never
 * removed piled one `error` listener per request scope onto the same warm client
 * until Node warned about a leaking emitter.
 */
describe('PostgresDatabaseAdapter checked-out client guard', () => {
  it('leaves no error listener on a pooled client once the checkout is released', async () => {
    const events: DatabaseConnectionErrorEvent[] = [];
    const adapter = scopedAdapter(events);
    await adapter.transaction(async () => null);
    state.reusePooledClient = true;
    const pooledClient = state.clients[0];
    expect(pooledClient).toBeDefined();

    const afterRelease: number[] = [];
    for (let scope = 0; scope < 12; scope++) {
      await adapter
        .withUser(makeJwt({ sub: `user-${scope}` }))
        .withOrg(`org-${scope}`)
        .query('select 1');
      afterRelease.push(pooledClient!.listenerCount('error'));
    }

    expect(Math.max(...afterRelease)).toBe(0);
    expect(state.clients).toHaveLength(1);
  });

  it('still reports a transport error raised while the client is checked out', async () => {
    const events: DatabaseConnectionErrorEvent[] = [];
    const adapter = scopedAdapter(events);
    await adapter.transaction(async () => null);
    state.reusePooledClient = true;
    const error = new Error('socket hang up');

    await adapter
      .withUser(makeJwt({ sub: 'user-7' }))
      .withOrg('org-7')
      .transaction(async () => {
        expect(() => state.clients[0]?.emit('error', error)).not.toThrow();
        return null;
      });

    expect(events).toEqual([{ scope: 'client', error }]);
  });

  it('takes the guard off on the failure path too, where the client may be destroyed', async () => {
    const events: DatabaseConnectionErrorEvent[] = [];
    const scoped = scopedAdapter(events).withUser(makeJwt({ sub: 'user-9' }));

    await expect(
      scoped.transaction(async () => {
        throw new Error('turn failed');
      }),
    ).rejects.toThrow('turn failed');

    expect(state.released).toBe(1);
    expect(state.clients[0]?.listenerCount('error')).toBe(0);
  });
});
