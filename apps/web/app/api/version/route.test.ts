import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: mocks.query }) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: mocks.warn, error: vi.fn(), debug: vi.fn() },
}));

const LEDGER_ROW = {
  sequence: 231,
  filename: '0231_object_backup_replicas.sql',
  applied_at: '2026-09-17T04:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.query.mockResolvedValue([LEDGER_ROW]);
  process.env['AGI_RELEASE_SHA'] = 'c0ffee1';
  process.env['AGI_DEPLOY_ENV'] = 'production';
});

// The route caches the ledger read in module scope, so each case needs its own
// module instance to observe a first read.
async function body() {
  const { GET } = await import('./route');
  const response = await GET();
  return (await response.json()) as Record<string, unknown>;
}

describe('GET /api/version', () => {
  it('reports the commit and environment the deployment was stamped with', async () => {
    await expect(body()).resolves.toMatchObject({
      commit: 'c0ffee1',
      environment: 'production',
    });
  });

  it('reports the highest applied migration so a schema skew is visible', async () => {
    await expect(body()).resolves.toMatchObject({
      migration: {
        sequence: 231,
        filename: '0231_object_backup_replicas.sql',
        appliedAt: '2026-09-17T04:00:00.000Z',
      },
    });
  });

  it('reports the model registry the deployment is serving', async () => {
    const payload = (await body())['modelRegistry'] as Record<string, unknown>;
    expect(payload['schemaVersion']).toBeTypeOf('number');
    expect(payload['models']).toBeGreaterThan(0);
    expect(payload['digest']).toMatch(/^[0-9a-f]{12}$/u);
  });

  it('answers with a null migration rather than failing when the ledger is unreadable', async () => {
    mocks.query.mockRejectedValue(new Error('connection terminated'));

    await expect(body()).resolves.toMatchObject({ migration: null });
    expect(mocks.warn).toHaveBeenCalled();
  });

  it('reads the ledger once for a burst of requests to a public endpoint', async () => {
    await body();
    await body();
    await body();

    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});
