/**
 * Supabase adapter tests with a mocked supabase-js client.
 *
 * We assert the adapter:
 *  - calls the right RPC for query/execute,
 *  - propagates errors,
 *  - implements `withUser()` immutably (returns a new instance),
 *  - implements `dispose()` and rejects further calls,
 *  - downloads / uploads / signs URLs through the storage namespace.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  SupabaseDatabaseAdapter,
  SupabaseAuthAdapter,
  SupabaseStorageAdapter,
} from '../adapters/supabase';
import type { DatabaseAdapter } from '../types';

// Build a minimal SupabaseClient stub that satisfies our adapter calls.
type RpcResp<T = unknown> = { data: T | null; error: { message: string } | null };

function makeDbStub(rpc: (name: string, args: unknown) => RpcResp) {
  // Cast through unknown to satisfy structural typing; we only use a tiny
  // surface (rpc method) so this is safe in tests.
  return { rpc } as unknown as Parameters<
    typeof SupabaseDatabaseAdapter.prototype.constructor
  >[0]['client'];
}

describe('SupabaseDatabaseAdapter', () => {
  it('passes sql + params to exec_sql RPC and returns rows', async () => {
    const rpc = vi.fn(
      (name: string, _args: unknown): RpcResp =>
        name === 'exec_sql' ? { data: [{ id: 'u1' }], error: null } : { data: null, error: null },
    );
    const adapter = new SupabaseDatabaseAdapter({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'k',
      client: makeDbStub(rpc),
    });
    const rows = await adapter.query<{ id: string }>('select id from users where id = $1', ['u1']);
    expect(rows).toEqual([{ id: 'u1' }]);
    expect(rpc).toHaveBeenCalledWith('exec_sql', {
      query: 'select id from users where id = $1',
      params: ['u1'],
    });
  });

  it('propagates RPC errors from query', async () => {
    const rpc = vi.fn(
      (_name: string, _args: unknown): RpcResp => ({ data: null, error: { message: 'db down' } }),
    );
    const adapter = new SupabaseDatabaseAdapter({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'k',
      client: makeDbStub(rpc),
    });
    await expect(adapter.query('select 1')).rejects.toMatchObject({ message: 'db down' });
  });

  it('execute() returns a number from exec_sql_count', async () => {
    const rpc = vi.fn(
      (name: string, _args: unknown): RpcResp =>
        name === 'exec_sql_count' ? { data: 3, error: null } : { data: null, error: null },
    );
    const adapter = new SupabaseDatabaseAdapter({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'k',
      client: makeDbStub(rpc),
    });
    const n = await adapter.execute('delete from sessions where expired = true');
    expect(n).toBe(3);
  });

  it('execute() coerces non-number RPC payloads to 0', async () => {
    const rpc = vi.fn((_name: string, _args: unknown): RpcResp => ({ data: null, error: null }));
    const adapter = new SupabaseDatabaseAdapter({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'k',
      client: makeDbStub(rpc),
    });
    expect(await adapter.execute('update x set y = 1')).toBe(0);
  });

  it('withUser returns a new adapter instance (immutable)', () => {
    const rpc = vi.fn((_n: string, _a: unknown): RpcResp => ({ data: [], error: null }));
    const adapter = new SupabaseDatabaseAdapter({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'k',
      client: makeDbStub(rpc),
    });
    const scoped = adapter.withUser('jwt-xxx');
    expect(scoped).not.toBe(adapter);
    expect(scoped).toBeInstanceOf(SupabaseDatabaseAdapter);
  });

  it('transaction throws NotImplementedError (Supabase JS cannot multiplex over a single connection)', async () => {
    const rpc = vi.fn((_n: string, _a: unknown): RpcResp => ({ data: [], error: null }));
    const adapter = new SupabaseDatabaseAdapter({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'k',
      client: makeDbStub(rpc),
    });
    let captured: DatabaseAdapter | null = null;
    await expect(
      adapter.transaction(async (tx) => {
        captured = tx;
        return 42;
      }),
    ).rejects.toThrow(/transaction/i);
    // Callback was NOT invoked — transaction throws before running fn
    // because there's no real BEGIN/COMMIT to wrap it in.
    expect(captured).toBeNull();
  });

  it('dispose() makes subsequent queries reject', async () => {
    const rpc = vi.fn((_n: string, _a: unknown): RpcResp => ({ data: [], error: null }));
    const adapter = new SupabaseDatabaseAdapter({
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'k',
      client: makeDbStub(rpc),
    });
    await adapter.dispose();
    await expect(adapter.query('select 1')).rejects.toThrow(/disposed/);
  });
});

describe('SupabaseAuthAdapter', () => {
  it('verifyJwt returns userId/email on success', async () => {
    const getUser = vi.fn(async (_token: string) => ({
      data: { user: { id: 'u-42', email: 'a@b.co' } },
      error: null,
    }));
    const client = { auth: { getUser } } as unknown as Parameters<
      typeof SupabaseAuthAdapter.prototype.constructor
    >[0]['client'];
    const auth = new SupabaseAuthAdapter({
      supabaseUrl: 'x',
      supabaseAnonKey: 'k',
      client,
    });
    const v = await auth.verifyJwt('jwt-token');
    expect(v).toEqual({ userId: 'u-42', email: 'a@b.co', raw: { id: 'u-42', email: 'a@b.co' } });
  });

  it('verifyJwt returns null on auth error', async () => {
    const getUser = vi.fn(async (_token: string) => ({
      data: { user: null },
      error: { message: 'bad jwt' },
    }));
    const client = { auth: { getUser } } as unknown as Parameters<
      typeof SupabaseAuthAdapter.prototype.constructor
    >[0]['client'];
    const auth = new SupabaseAuthAdapter({
      supabaseUrl: 'x',
      supabaseAnonKey: 'k',
      client,
    });
    expect(await auth.verifyJwt('bad-jwt')).toBeNull();
  });

  it('refreshToken returns a fresh pair on success', async () => {
    const refreshSession = vi.fn(async (_args: unknown) => ({
      data: {
        session: { access_token: 'a1', refresh_token: 'r1', expires_at: 1234 },
      },
      error: null,
    }));
    const client = { auth: { refreshSession } } as unknown as Parameters<
      typeof SupabaseAuthAdapter.prototype.constructor
    >[0]['client'];
    const auth = new SupabaseAuthAdapter({
      supabaseUrl: 'x',
      supabaseAnonKey: 'k',
      client,
    });
    expect(await auth.refreshToken('rt-old')).toEqual({
      accessToken: 'a1',
      refreshToken: 'r1',
      expiresAt: 1234,
    });
  });

  it('refreshToken returns null on error', async () => {
    const refreshSession = vi.fn(async (_args: unknown) => ({
      data: { session: null },
      error: { message: 'expired' },
    }));
    const client = { auth: { refreshSession } } as unknown as Parameters<
      typeof SupabaseAuthAdapter.prototype.constructor
    >[0]['client'];
    const auth = new SupabaseAuthAdapter({
      supabaseUrl: 'x',
      supabaseAnonKey: 'k',
      client,
    });
    expect(await auth.refreshToken('expired')).toBeNull();
  });
});

describe('SupabaseStorageAdapter', () => {
  it('signedUrl rejects ttl <= 0', async () => {
    const client = {
      storage: {
        from: () => ({
          createSignedUrl: vi.fn(),
        }),
      },
    } as unknown as Parameters<typeof SupabaseStorageAdapter.prototype.constructor>[0]['client'];
    const storage = new SupabaseStorageAdapter({
      supabaseUrl: 'x',
      supabaseKey: 'k',
      client,
    });
    await expect(storage.signedUrl('bucket', 'key', 0)).rejects.toThrow(/ttlSeconds/);
    await expect(storage.signedUrl('bucket', 'key', -1)).rejects.toThrow(/ttlSeconds/);
  });

  it('get returns null on not-found error', async () => {
    const client = {
      storage: {
        from: () => ({
          download: vi.fn(async () => ({ data: null, error: { message: 'Object not found' } })),
        }),
      },
    } as unknown as Parameters<typeof SupabaseStorageAdapter.prototype.constructor>[0]['client'];
    const storage = new SupabaseStorageAdapter({
      supabaseUrl: 'x',
      supabaseKey: 'k',
      client,
    });
    expect(await storage.get('bucket', 'missing')).toBeNull();
  });

  it('get throws on non-not-found error', async () => {
    const client = {
      storage: {
        from: () => ({
          download: vi.fn(async () => ({ data: null, error: { message: 'permission denied' } })),
        }),
      },
    } as unknown as Parameters<typeof SupabaseStorageAdapter.prototype.constructor>[0]['client'];
    const storage = new SupabaseStorageAdapter({
      supabaseUrl: 'x',
      supabaseKey: 'k',
      client,
    });
    await expect(storage.get('bucket', 'forbidden')).rejects.toMatchObject({
      message: 'permission denied',
    });
  });

  it('put returns the public URL and key', async () => {
    const client = {
      storage: {
        from: () => ({
          upload: vi.fn(async () => ({ data: { path: 'a/b.txt' }, error: null })),
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://cdn/a/b.txt' } })),
        }),
      },
    } as unknown as Parameters<typeof SupabaseStorageAdapter.prototype.constructor>[0]['client'];
    const storage = new SupabaseStorageAdapter({
      supabaseUrl: 'x',
      supabaseKey: 'k',
      client,
    });
    const r = await storage.put('bucket', 'a/b.txt', new Uint8Array([1, 2, 3]));
    expect(r).toEqual({ url: 'https://cdn/a/b.txt', key: 'a/b.txt' });
  });
});
