import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  REMOTE_DATABASE_OVERRIDE_VALUE,
  REMOTE_DATABASE_OVERRIDE_VAR,
  DataLayerConfigError,
  NeonDatabaseAdapter,
  PostgresDatabaseAdapter,
} from '../index';

const SAVED_ENV: Record<string, string | undefined> = {};
const ENV_KEYS = [
  'AGI_DATABASE_PROVIDER',
  'AGI_DATABASE_URL',
  'DATABASE_URL',
  REMOTE_DATABASE_OVERRIDE_VAR,
];

// The connection strings below name fictional remote hosts, because the subject
// under test is provider selection and TLS enforcement, not where the database
// lives. `assertDatabaseEnvironmentIsolation` would otherwise refuse every one
// of them under NODE_ENV=test, so this suite takes the override deliberately.
// The guard's own matrix is covered in environment-isolation.test.ts, and the
// last case here proves the factory still calls it.

beforeEach(() => {
  for (const k of ENV_KEYS) SAVED_ENV[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  process.env[REMOTE_DATABASE_OVERRIDE_VAR] = REMOTE_DATABASE_OVERRIDE_VALUE;
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

  it('refuses a remote database under a test runtime without the override', () => {
    delete process.env[REMOTE_DATABASE_OVERRIDE_VAR];
    process.env['AGI_DATABASE_URL'] = 'postgresql://u:p@ep.neon.tech/db?sslmode=require';
    expect(() => createDatabaseClient()).toThrow(/not a loopback/);
  });
});
