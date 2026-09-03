import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NeonDatabaseAdapter } from '../adapters/neon';

/**
 * The local WebSocket proxy hook exists so the app can be pointed at a
 * throwaway Postgres. Its whole safety story is that it does nothing unless
 * asked, and refuses anything but loopback when it is.
 */
const VAR = 'AGI_DATABASE_WS_PROXY';
const original = process.env[VAR];

function adapter() {
  return new NeonDatabaseAdapter({ connectionString: 'postgresql://u:p@localhost/d' });
}

beforeEach(() => {
  delete process.env[VAR];
});

afterEach(() => {
  if (original === undefined) delete process.env[VAR];
  else process.env[VAR] = original;
});

describe('AGI_DATABASE_WS_PROXY', () => {
  it('is unset in a normal environment, which is every deployed one', () => {
    expect(process.env[VAR]).toBeUndefined();
  });

  it('rejects a remote host, because honouring one ships credentials off-box', async () => {
    process.env[VAR] = 'attacker.example.com:5433';
    await expect(adapter().query('select 1')).rejects.toThrow(/loopback/i);
  });

  it('names the variable in its refusal so the cause is findable', async () => {
    process.env[VAR] = 'db.internal:5433';
    await expect(adapter().query('select 1')).rejects.toThrow(/AGI_DATABASE_WS_PROXY/);
  });

  it('does not disguise its refusal as the missing-driver error beside it', async () => {
    // Both paths throw DataLayerConfigError. Re-throwing the proxy refusal must
    // not let it be reported as "@neondatabase/serverless is not installed".
    process.env[VAR] = 'evil.test:1';
    await expect(adapter().query('select 1')).rejects.toThrow(/loopback/i);
    await expect(adapter().query('select 1')).rejects.not.toThrow(/not installed/i);
  });
});
