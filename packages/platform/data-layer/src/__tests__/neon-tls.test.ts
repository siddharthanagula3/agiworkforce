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
  it('accepts a Neon connection string with no sslmode at all', () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@ep-xxx.us-east-2.aws.neon.tech/db',
    });
    expect(adapter).toBeInstanceOf(NeonDatabaseAdapter);
  });

  it('accepts the bare neon.tech apex host with no sslmode', () => {
    const adapter = new NeonDatabaseAdapter({ connectionString: 'postgresql://u:p@neon.tech/db' });
    expect(adapter).toBeInstanceOf(NeonDatabaseAdapter);
  });

  it('refuses a Neon connection string with sslmode=disable', () => {
    expect(
      () =>
        new NeonDatabaseAdapter({
          connectionString: 'postgresql://u:p@ep.neon.tech/db?sslmode=disable',
        }),
    ).toThrow(/sslmode=disable/);
  });

  it('refuses a non-Neon connection string with no sslmode', () => {
    expect(
      () => new NeonDatabaseAdapter({ connectionString: 'postgresql://u:p@example.com/db' }),
    ).toThrow(DataLayerConfigError);
    expect(
      () => new NeonDatabaseAdapter({ connectionString: 'postgresql://u:p@example.com/db' }),
    ).toThrow(/sslmode=require/);
  });

  it('refuses a non-Neon connection string with an sslmode that permits plaintext', () => {
    for (const sslmode of ['disable', 'allow', 'prefer']) {
      expect(
        () =>
          new NeonDatabaseAdapter({
            connectionString: `postgresql://u:p@example.com/db?sslmode=${sslmode}`,
          }),
      ).toThrow(DataLayerConfigError);
    }
  });

  it('does not treat a host that merely contains neon.tech as a Neon endpoint', () => {
    expect(
      () =>
        new NeonDatabaseAdapter({
          connectionString: 'postgresql://u:p@neon.tech.attacker.example/db',
        }),
    ).toThrow(/sslmode=require/);
  });

  it('refuses a connection string that is not a valid URL', () => {
    expect(() => new NeonDatabaseAdapter({ connectionString: 'not-a-url' })).toThrow(
      /not a valid connection string/,
    );
  });

  it('accepts a non-Neon host with sslmode=require', async () => {
    const adapter = new NeonDatabaseAdapter({
      connectionString: 'postgresql://u:p@example.com/db?sslmode=require',
    });
    await expect(adapter.dispose()).resolves.toBeUndefined();
  });

  it.each(['verify-ca', 'verify-full'])(
    'accepts a non-Neon host with sslmode=%s',
    async (sslmode) => {
      const adapter = new NeonDatabaseAdapter({
        connectionString: `postgresql://u:p@example.com/db?sslmode=${sslmode}`,
      });
      await expect(adapter.dispose()).resolves.toBeUndefined();
    },
  );

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
