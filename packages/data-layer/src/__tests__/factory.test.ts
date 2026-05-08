/**
 * Factory tests. We assert env-resolution and error paths — the
 * adapters themselves are tested in `supabase-adapter.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  createAuthClient,
  createStorageClient,
  createRealtimeClient,
  DataLayerConfigError,
  NotImplementedError,
  SupabaseDatabaseAdapter,
  SupabaseAuthAdapter,
  SupabaseStorageAdapter,
  SupabaseRealtimeAdapter,
  NeonDatabaseAdapter,
  PostgresDatabaseAdapter,
} from '../index';

const SAVED_ENV: Record<string, string | undefined> = {};
const ENV_KEYS = [
  'AGI_DATABASE_PROVIDER',
  'AGI_AUTH_PROVIDER',
  'AGI_STORAGE_PROVIDER',
  'AGI_REALTIME_PROVIDER',
  'AGI_DATABASE_URL',
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

beforeEach(() => {
  for (const k of ENV_KEYS) SAVED_ENV[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    const saved = SAVED_ENV[k];
    if (saved === undefined) delete process.env[k];
    else process.env[k] = saved;
  }
});

describe('createDatabaseClient', () => {
  it('defaults to supabase when no env is set and creds provided', () => {
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://example.supabase.co';
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'anon-key-test';
    const db = createDatabaseClient();
    expect(db).toBeInstanceOf(SupabaseDatabaseAdapter);
  });

  it('throws when supabase chosen without env', () => {
    expect(() => createDatabaseClient()).toThrow(DataLayerConfigError);
  });

  it('returns Neon adapter when AGI_DATABASE_PROVIDER=neon', () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'neon';
    process.env['AGI_DATABASE_URL'] = 'postgresql://u:p@ep.neon.tech/db';
    const db = createDatabaseClient();
    expect(db).toBeInstanceOf(NeonDatabaseAdapter);
  });

  it('Neon adapter is constructed lazily without opening a connection', async () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'neon';
    process.env['AGI_DATABASE_URL'] = 'postgresql://u:p@ep.neon.tech/db';
    // Construction must NOT throw — connections open on first query.
    const db = createDatabaseClient();
    expect(db).toBeInstanceOf(NeonDatabaseAdapter);
    // Dispose without ever connecting must be safe (no network in tests).
    await expect(db.dispose()).resolves.toBeUndefined();
  });

  it('returns Postgres adapter when AGI_DATABASE_PROVIDER=postgres', () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'postgres';
    process.env['AGI_DATABASE_URL'] = 'postgresql://u:p@host:5432/db';
    const db = createDatabaseClient();
    expect(db).toBeInstanceOf(PostgresDatabaseAdapter);
  });

  it('Postgres adapter throws NotImplementedError on query', async () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'postgres';
    process.env['AGI_DATABASE_URL'] = 'postgresql://u:p@host:5432/db';
    const db = createDatabaseClient();
    await expect(db.query('select 1')).rejects.toBeInstanceOf(NotImplementedError);
  });

  it('throws on unknown provider value', () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'mongodb';
    expect(() => createDatabaseClient()).toThrow(DataLayerConfigError);
  });

  it('respects explicit options over env', () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'neon';
    process.env['AGI_DATABASE_URL'] = 'postgresql://u:p@ep.neon.tech/db';
    const db = createDatabaseClient({
      provider: 'supabase',
      supabaseUrl: 'https://override.supabase.co',
      supabaseKey: 'override-key',
    });
    expect(db).toBeInstanceOf(SupabaseDatabaseAdapter);
  });

  it('falls back to DATABASE_URL when AGI_DATABASE_URL is unset', () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'postgres';
    process.env['DATABASE_URL'] = 'postgresql://u:p@fallback:5432/db';
    const db = createDatabaseClient();
    expect(db).toBeInstanceOf(PostgresDatabaseAdapter);
  });

  it('throws when Neon provider chosen without connection string', () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'neon';
    expect(() => createDatabaseClient()).toThrow(DataLayerConfigError);
  });
});

describe('createAuthClient', () => {
  it('defaults to supabase', () => {
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://example.supabase.co';
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'anon-key';
    const auth = createAuthClient();
    expect(auth).toBeInstanceOf(SupabaseAuthAdapter);
  });

  it('throws on unimplemented providers (auth0)', () => {
    process.env['AGI_AUTH_PROVIDER'] = 'auth0';
    expect(() => createAuthClient()).toThrow(DataLayerConfigError);
  });

  it('throws on unimplemented providers (clerk)', () => {
    process.env['AGI_AUTH_PROVIDER'] = 'clerk';
    expect(() => createAuthClient()).toThrow(DataLayerConfigError);
  });

  it('throws on unimplemented providers (cognito)', () => {
    process.env['AGI_AUTH_PROVIDER'] = 'cognito';
    expect(() => createAuthClient()).toThrow(DataLayerConfigError);
  });

  it('throws when supabase chosen without env', () => {
    expect(() => createAuthClient()).toThrow(DataLayerConfigError);
  });
});

describe('createStorageClient', () => {
  it('defaults to supabase', () => {
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://example.supabase.co';
    process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'svc-key';
    const storage = createStorageClient();
    expect(storage).toBeInstanceOf(SupabaseStorageAdapter);
  });

  it('throws on unimplemented providers (s3)', () => {
    process.env['AGI_STORAGE_PROVIDER'] = 's3';
    expect(() => createStorageClient()).toThrow(DataLayerConfigError);
  });

  it('throws on unimplemented providers (r2)', () => {
    process.env['AGI_STORAGE_PROVIDER'] = 'r2';
    expect(() => createStorageClient()).toThrow(DataLayerConfigError);
  });
});

describe('createRealtimeClient', () => {
  it('defaults to supabase', () => {
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://example.supabase.co';
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'anon-key';
    const rt = createRealtimeClient();
    expect(rt).toBeInstanceOf(SupabaseRealtimeAdapter);
  });

  it('throws on unimplemented providers (pusher)', () => {
    process.env['AGI_REALTIME_PROVIDER'] = 'pusher';
    expect(() => createRealtimeClient()).toThrow(DataLayerConfigError);
  });

  it('throws on unimplemented providers (ably)', () => {
    process.env['AGI_REALTIME_PROVIDER'] = 'ably';
    expect(() => createRealtimeClient()).toThrow(DataLayerConfigError);
  });
});

describe('NotImplementedError messages', () => {
  it('includes adapter name and migration guide hint', () => {
    const err = new NotImplementedError('Neon', 'query', 'Step 1: install driver');
    expect(err.message).toContain('Neon adapter does not implement query()');
    expect(err.message).toContain('Step 1: install driver');
    expect(err.name).toBe('NotImplementedError');
  });
});
