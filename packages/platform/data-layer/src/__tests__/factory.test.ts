import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  createAuthClient,
  createRealtimeClient,
  DataLayerConfigError,
  NotImplementedError,
  ClerkAuthAdapter,
  NeonDatabaseAdapter,
  PostgresDatabaseAdapter,
} from '../index';

const SAVED_ENV: Record<string, string | undefined> = {};
const ENV_KEYS = [
  'AGI_DATABASE_PROVIDER',
  'AGI_AUTH_PROVIDER',
  'AGI_REALTIME_PROVIDER',
  'AGI_DATABASE_URL',
  'DATABASE_URL',
  'CLERK_SECRET_KEY',
  'CLERK_JWT_KEY',
  'CLERK_AUTHORIZED_PARTIES',
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
  it('defaults to neon when no env is set and connection string provided', () => {
    process.env['AGI_DATABASE_URL'] = 'postgresql://u:p@ep.neon.tech/db?sslmode=require';
    const db = createDatabaseClient();
    expect(db).toBeInstanceOf(NeonDatabaseAdapter);
  });

  it('throws when default Neon has no connection string', () => {
    expect(() => createDatabaseClient()).toThrow(DataLayerConfigError);
  });

  it('returns Neon adapter when AGI_DATABASE_PROVIDER=neon', () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'neon';
    process.env['AGI_DATABASE_URL'] = 'postgresql://u:p@ep.neon.tech/db?sslmode=require';
    const db = createDatabaseClient();
    expect(db).toBeInstanceOf(NeonDatabaseAdapter);
  });

  it('Neon adapter is constructed lazily without opening a connection', async () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'neon';
    process.env['AGI_DATABASE_URL'] = 'postgresql://u:p@ep.neon.tech/db?sslmode=require';
    const db = createDatabaseClient();
    expect(db).toBeInstanceOf(NeonDatabaseAdapter);
    await expect(db.dispose()).resolves.toBeUndefined();
  });

  it('returns Postgres adapter when AGI_DATABASE_PROVIDER=postgres', () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'postgres';
    process.env['AGI_DATABASE_URL'] = 'postgresql://u:p@host:5432/db?sslmode=require';
    const db = createDatabaseClient();
    expect(db).toBeInstanceOf(PostgresDatabaseAdapter);
  });

  it('Postgres adapter is constructed lazily without opening a connection', async () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'postgres';
    process.env['AGI_DATABASE_URL'] = 'postgresql://u:p@host:5432/db?sslmode=require';
    const db = createDatabaseClient();
    expect(db).toBeInstanceOf(PostgresDatabaseAdapter);
    await expect(db.dispose()).resolves.toBeUndefined();
  });

  it('refuses a remote Postgres connection string that would run unencrypted', () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'postgres';
    process.env['AGI_DATABASE_URL'] = 'postgresql://u:p@host:5432/db';
    expect(() => createDatabaseClient()).toThrow(DataLayerConfigError);
  });

  it('allows a loopback Postgres connection string without sslmode', () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'postgres';
    process.env['AGI_DATABASE_URL'] = 'postgresql://u:p@127.0.0.1:5432/db';
    expect(createDatabaseClient()).toBeInstanceOf(PostgresDatabaseAdapter);
  });

  it('throws on unknown provider value', () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'mongodb';
    expect(() => createDatabaseClient()).toThrow(DataLayerConfigError);
  });

  it('respects explicit Neon provider options over env', () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'postgres';
    process.env['AGI_DATABASE_URL'] = 'postgresql://u:p@ep1.neon.tech/db?sslmode=require';
    const db = createDatabaseClient({
      provider: 'neon',
      connectionString: 'postgresql://u:p@override.neon.tech/db?sslmode=require',
    });
    expect(db).toBeInstanceOf(NeonDatabaseAdapter);
  });

  it('falls back to DATABASE_URL when AGI_DATABASE_URL is unset', () => {
    process.env['DATABASE_URL'] = 'postgresql://u:p@fallback:5432/db?sslmode=require';
    const db = createDatabaseClient();
    expect(db).toBeInstanceOf(NeonDatabaseAdapter);
  });

  it('honours explicit Postgres provider selection over a neon env value', () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'neon';
    const db = createDatabaseClient({
      provider: 'postgres',
      connectionString: 'postgresql://u:p@host:5432/db?sslmode=require',
    });
    expect(db).toBeInstanceOf(PostgresDatabaseAdapter);
  });

  it('throws when Neon provider chosen without connection string', () => {
    process.env['AGI_DATABASE_PROVIDER'] = 'neon';
    expect(() => createDatabaseClient()).toThrow(DataLayerConfigError);
  });
});

describe('createAuthClient', () => {
  it('defaults to clerk', () => {
    process.env['CLERK_JWT_KEY'] = 'test-jwt-key';
    const auth = createAuthClient();
    expect(auth).toBeInstanceOf(ClerkAuthAdapter);
  });

  it('throws on unimplemented providers (auth0)', () => {
    process.env['AGI_AUTH_PROVIDER'] = 'auth0';
    expect(() => createAuthClient()).toThrow(DataLayerConfigError);
  });

  it('returns Clerk adapter when AGI_AUTH_PROVIDER=clerk', () => {
    process.env['AGI_AUTH_PROVIDER'] = 'clerk';
    process.env['CLERK_JWT_KEY'] = 'test-jwt-key';
    const auth = createAuthClient();
    expect(auth).toBeInstanceOf(ClerkAuthAdapter);
  });

  it('throws when Clerk is chosen without verification keys', () => {
    process.env['AGI_AUTH_PROVIDER'] = 'clerk';
    expect(() => createAuthClient()).toThrow(DataLayerConfigError);
  });

  it('throws on unimplemented providers (cognito)', () => {
    process.env['AGI_AUTH_PROVIDER'] = 'cognito';
    expect(() => createAuthClient()).toThrow(DataLayerConfigError);
  });

  it('throws when a removed legacy auth provider is configured', () => {
    process.env['AGI_AUTH_PROVIDER'] = 'legacy-auth';
    expect(() => createAuthClient()).toThrow(DataLayerConfigError);
  });
});

describe('createRealtimeClient', () => {
  it('throws when no realtime provider is configured', () => {
    expect(() => createRealtimeClient()).toThrow(DataLayerConfigError);
  });

  it('throws when a removed legacy realtime provider is configured', () => {
    process.env['AGI_REALTIME_PROVIDER'] = 'legacy-realtime';
    expect(() => createRealtimeClient()).toThrow(DataLayerConfigError);
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
