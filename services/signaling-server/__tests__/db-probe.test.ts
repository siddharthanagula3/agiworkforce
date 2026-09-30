import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
  query: vi.fn(),
}));

vi.unmock('../src/db.js');

vi.mock('@neondatabase/serverless', () => ({
  Pool: class {
    constructor(options: Record<string, unknown>) {
      pool.options = options;
    }
    query = pool.query;
    on(): void {}
  },
}));

const { probeDatabase } = await import('../src/db.js');

beforeEach(() => {
  pool.query.mockReset();
});

describe('the pairing store pool', () => {
  it('bounds how long a checkout or a query may wait', () => {
    expect(pool.options).toMatchObject({
      connectionTimeoutMillis: expect.any(Number),
      query_timeout: expect.any(Number),
    });
  });

  it('sends no startup parameter the pooled Neon endpoint refuses', () => {
    expect(pool.options).not.toHaveProperty('statement_timeout');
    expect(pool.options).not.toHaveProperty('options');
  });
});

describe('probeDatabase', () => {
  it('reads the pairing table, not just the socket', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    await expect(probeDatabase()).resolves.toMatchObject({ ok: true });
    expect(String(pool.query.mock.calls[0]?.[0])).toContain('signaling_sessions');
  });

  it('reports a missing table by its SQLSTATE', async () => {
    pool.query.mockRejectedValue(
      Object.assign(new Error('relation "signaling_sessions" does not exist'), { code: '42P01' }),
    );
    await expect(probeDatabase()).resolves.toEqual({ ok: false, reason: '42P01' });
  });

  it('never repeats the driver message, which can name the host', async () => {
    pool.query.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED db.internal:5432'), { code: 'ECONNREFUSED' }),
    );
    const result = await probeDatabase();
    expect(result).toEqual({ ok: false, reason: 'unreachable' });
    expect(JSON.stringify(result)).not.toContain('db.internal');
  });

  it('gives up at its deadline instead of waiting on a stalled pool', async () => {
    pool.query.mockReturnValue(new Promise(() => undefined));
    await expect(probeDatabase(20)).resolves.toEqual({ ok: false, reason: 'timeout' });
  });
});
