import { EventEmitter } from 'node:events';
import type { Pool } from '@neondatabase/serverless';
import { describe, expect, it, vi } from 'vitest';
import { queryWithStatementTimeout } from '../src/db-query.js';

function fixture() {
  const client = Object.assign(new EventEmitter(), {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  });
  const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pick<Pool, 'connect'>;
  const report = vi.fn();
  return { client, pool, report };
}

describe('transaction-local query timeout', () => {
  it('uses one client and returns the statement result after commit', async () => {
    const { client, pool, report } = fixture();
    const result = { rows: [{ code: 'session' }] };
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(result);
    await expect(
      queryWithStatementTimeout(pool, 'SELECT code WHERE code = $1', ['session'], 4000, report),
    ).resolves.toBe(result);
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls).toEqual([
      ['BEGIN'],
      ["SELECT set_config('statement_timeout', $1, true)", ['4000']],
      ['SELECT code WHERE code = $1', ['session']],
      ['COMMIT'],
    ]);
    expect(client.release).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(client.listenerCount('error')).toBe(0);
  });

  for (const stage of [0, 1, 2, 3]) {
    it(`destroys the client after failure at transaction stage ${stage}`, async () => {
      const { client, pool, report } = fixture();
      const error = Object.assign(new Error('statement cancelled'), { code: '57014' });
      client.query.mockImplementation(async () => {
        if (client.query.mock.calls.length === stage + 1) throw error;
        return { rows: [] };
      });
      await expect(
        queryWithStatementTimeout(pool, 'SELECT pg_sleep(10)', [], 4000, report),
      ).rejects.toBe(error);
      expect(client.release).toHaveBeenCalledExactlyOnceWith(error);
      expect(client.query).toHaveBeenCalledTimes(stage + 1);
      expect(client.listenerCount('error')).toBe(0);
    });
  }

  for (const rejection of [null, undefined, false]) {
    it(`destroys rather than pools a transaction rejected with ${String(rejection)}`, async () => {
      const { client, pool, report } = fixture();
      client.query.mockRejectedValueOnce(rejection);
      await expect(queryWithStatementTimeout(pool, 'SELECT 1', [], 4000, report)).rejects.toBe(
        rejection,
      );
      expect(client.release).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
      expect(client.listenerCount('error')).toBe(0);
    });
  }

  for (const stage of [0, 2]) {
    it(`handles a transport error during transaction stage ${stage} without crashing`, async () => {
      const { client, pool, report } = fixture();
      const error = new Error('transport closed');
      client.query.mockImplementation(async () => {
        if (client.query.mock.calls.length === stage + 1) {
          expect(() => client.emit('error', error)).not.toThrow();
          throw error;
        }
        return { rows: [] };
      });
      await expect(queryWithStatementTimeout(pool, 'SELECT 1', [], 4000, report)).rejects.toBe(
        error,
      );
      expect(report).toHaveBeenCalledExactlyOnceWith(error);
      expect(client.release).toHaveBeenCalledExactlyOnceWith(error);
      expect(client.listenerCount('error')).toBe(0);
    });
  }

  it('does not retry a commit whose outcome is unknown', async () => {
    const { client, pool, report } = fixture();
    client.query.mockImplementation(async () => {
      if (client.query.mock.calls.length === 4) throw new Error('Query read timeout');
      return { rows: [] };
    });
    await expect(
      queryWithStatementTimeout(
        pool,
        'INSERT INTO sessions VALUES ($1)',
        ['session'],
        4000,
        report,
      ),
    ).rejects.toThrow('Query read timeout');
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT'))).toHaveLength(1);
    expect(client.release).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
  });
});
