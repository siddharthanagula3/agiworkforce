import { describe, expect, it } from 'vitest';

import {
  assertDatabaseEnvironmentIsolation,
  isLoopbackConnectionString,
  resolveRuntimeEnvironment,
  REMOTE_DATABASE_OVERRIDE_VALUE,
  REMOTE_DATABASE_OVERRIDE_VAR,
  type IsolationEnvironment,
} from '../environment-isolation';
import { DataLayerConfigError } from '../types';

const LOCAL_DB = 'postgresql://u:p@127.0.0.1:5432/agiworkforce_dev';
const TEST_DB = 'postgresql://test:test@127.0.0.1:1/agi_test_must_not_connect?sslmode=require';
const SHARED_DB = 'postgresql://u:p@ep-little-math-apu2yl8h-pooler.c-7.aws.neon.tech/db';

function assertIn(env: IsolationEnvironment, connectionString: string): void {
  assertDatabaseEnvironmentIsolation({ connectionString, env });
}

describe('resolveRuntimeEnvironment', () => {
  it('defaults to development when nothing declares an environment', () => {
    expect(resolveRuntimeEnvironment({})).toBe('development');
  });

  it('reads NODE_ENV when no deployment marker is present', () => {
    expect(resolveRuntimeEnvironment({ NODE_ENV: 'test' })).toBe('test');
  });

  it('lets the platform deployment marker win over NODE_ENV', () => {
    expect(resolveRuntimeEnvironment({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })).toBe(
      'preview',
    );
  });

  it('prefers the vendor-neutral AGI_DEPLOY_ENV over the platform variable', () => {
    expect(resolveRuntimeEnvironment({ AGI_DEPLOY_ENV: 'production', VERCEL_ENV: 'preview' })).toBe(
      'production',
    );
  });

  it('ignores an environment name it does not recognise', () => {
    expect(resolveRuntimeEnvironment({ VERCEL_ENV: 'staging', NODE_ENV: 'test' })).toBe('test');
  });
});

describe('isLoopbackConnectionString', () => {
  it.each([
    'postgresql://u:p@localhost:5432/db',
    'postgresql://u:p@127.0.0.1:5432/db',
    'postgresql://u:p@127.9.9.9:5432/db',
    'postgresql://u:p@[::1]:5432/db',
    'postgresql://u:p@db.localhost:5432/db',
  ])('accepts %s', (connectionString) => {
    expect(isLoopbackConnectionString(connectionString)).toBe(true);
  });

  it.each([
    'postgresql://u:p@ep.neon.tech/db',
    'postgresql://u:p@10.0.0.4:5432/db',
    'postgresql://u:p@localhost.attacker.example/db',
    'not-a-connection-string',
  ])('rejects %s', (connectionString) => {
    expect(isLoopbackConnectionString(connectionString)).toBe(false);
  });
});

describe('assertDatabaseEnvironmentIsolation', () => {
  it('allows development against a local database', () => {
    expect(() => assertIn({ NODE_ENV: 'development' }, LOCAL_DB)).not.toThrow();
  });

  it('allows test against a test database', () => {
    expect(() => assertIn({ NODE_ENV: 'test' }, TEST_DB)).not.toThrow();
  });

  it('allows production against a production database', () => {
    expect(() =>
      assertIn({ NODE_ENV: 'production', VERCEL_ENV: 'production' }, SHARED_DB),
    ).not.toThrow();
  });

  it('allows a preview deployment against its own remote database', () => {
    expect(() =>
      assertIn({ NODE_ENV: 'production', VERCEL_ENV: 'preview' }, SHARED_DB),
    ).not.toThrow();
  });

  it('rejects development against a production database', () => {
    expect(() => assertIn({ NODE_ENV: 'development' }, SHARED_DB)).toThrow(DataLayerConfigError);
    expect(() => assertIn({ NODE_ENV: 'development' }, SHARED_DB)).toThrow(/not a loopback/);
  });

  it('rejects test against a production database', () => {
    expect(() => assertIn({ NODE_ENV: 'test' }, SHARED_DB)).toThrow(DataLayerConfigError);
  });

  it('rejects an unset environment against a production database', () => {
    expect(() => assertIn({}, SHARED_DB)).toThrow(DataLayerConfigError);
  });

  it('names the offending host and the override in the refusal', () => {
    try {
      assertIn({ NODE_ENV: 'development' }, SHARED_DB);
      expect.unreachable('the guard should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('ep-little-math-apu2yl8h-pooler.c-7.aws.neon.tech');
      expect(message).toContain(REMOTE_DATABASE_OVERRIDE_VAR);
      expect(message).toContain(REMOTE_DATABASE_OVERRIDE_VALUE);
    }
  });

  it('honours the explicit override', () => {
    expect(() =>
      assertIn(
        {
          NODE_ENV: 'development',
          [REMOTE_DATABASE_OVERRIDE_VAR]: REMOTE_DATABASE_OVERRIDE_VALUE,
        },
        SHARED_DB,
      ),
    ).not.toThrow();
  });

  it.each(['1', 'true', 'yes', 'YES-I-AM-POINTING-A-DEVELOPMENT-RUNTIME-AT-A-SHARED-DATABASE'])(
    'refuses a reflexive override value %s',
    (value) => {
      expect(() =>
        assertIn({ NODE_ENV: 'development', [REMOTE_DATABASE_OVERRIDE_VAR]: value }, SHARED_DB),
      ).toThrow(DataLayerConfigError);
    },
  );

  it('leaves an unparseable connection string to the adapter to report', () => {
    expect(() => assertIn({ NODE_ENV: 'development' }, 'not-a-connection-string')).not.toThrow();
  });
});
