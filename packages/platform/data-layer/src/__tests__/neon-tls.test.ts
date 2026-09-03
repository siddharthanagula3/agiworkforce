import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NeonDatabaseAdapter } from '../adapters/neon';
import { DataLayerConfigError } from '../types';

const VAR = 'AGI_DATABASE_WS_PROXY';
const original = process.env[VAR];

beforeEach(() => {
  delete process.env[VAR];
});

afterEach(() => {
  if (original === undefined) delete process.env[VAR];
  else process.env[VAR] = original;
});

describe('NeonDatabaseAdapter TLS enforcement', () => {
  it('refuses a connection string with no sslmode', () => {
    expect(
      () => new NeonDatabaseAdapter({ connectionString: 'postgresql://u:p@ep.neon.tech/db' }),
    ).toThrow(DataLayerConfigError);
    expect(
      () => new NeonDatabaseAdapter({ connectionString: 'postgresql://u:p@ep.neon.tech/db' }),
    ).toThrow(/sslmode=require/);
  });

  it('refuses sslmode values that permit or default to a plaintext connection', () => {
    for (const sslmode of ['disable', 'allow', 'prefer']) {
      expect(
        () =>
          new NeonDatabaseAdapter({
            connectionString: `postgresql://u:p@ep.neon.tech/db?sslmode=${sslmode}`,
          }),
      ).toThrow(/sslmode=require/);
    }
  });

  it('refuses a connection string that is not a valid URL', () => {
    expect(() => new NeonDatabaseAdapter({ connectionString: 'not-a-url' })).toThrow(
      /not a valid connection string/,
    );
  });

  it('accepts sslmode=require and constructs without opening a connection', async () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep.neon.tech/db?sslmode=require',
    });
    await expect(adapter.dispose()).resolves.toBeUndefined();
  });

  it.each(['verify-ca', 'verify-full'])('accepts sslmode=%s', async (sslmode) => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: `postgresql://u:p@ep.neon.tech/db?sslmode=${sslmode}`,
    });
    await expect(adapter.dispose()).resolves.toBeUndefined();
  });

  it('skips the sslmode requirement when the loopback-only local proxy is configured', async () => {
    process.env[VAR] = '127.0.0.1:5433';
    const adapter = new NeonDatabaseAdapter({ connectionString: 'postgresql://u:p@ignored/db' });
    expect(adapter).toBeInstanceOf(NeonDatabaseAdapter);
  });

  it('never validates a connection string when a pool is injected directly', () => {
    const fakePool = { on: () => {}, end: async () => {} } as never;
    expect(
      () => new NeonDatabaseAdapter({ connectionString: 'not-a-url', pool: fakePool }),
    ).not.toThrow();
  });
});
