import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  sweepExpiredMemories: vi.fn(),
  consolidateMemories: vi.fn(),
  getNeonDb: vi.fn(() => ({ query: vi.fn() })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mocks.getNeonDb }));
vi.mock('@/lib/services/managed-memory-context-service', () => ({
  sweepExpiredMemories: mocks.sweepExpiredMemories,
  consolidateMemories: mocks.consolidateMemories,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from './route';

function req() {
  return new Request('http://localhost/api/cron/expire-memories') as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.sweepExpiredMemories.mockResolvedValue({ expired: 3, remaining: false });
  mocks.consolidateMemories.mockResolvedValue({ merged: 2, superseded: 1, remaining: false });
});

describe('GET /api/cron/expire-memories', () => {
  it('401s and sweeps nothing without cron authorization', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);

    const response = await GET(req());

    expect(response.status).toBe(401);
    expect(mocks.sweepExpiredMemories).not.toHaveBeenCalled();
    expect(mocks.consolidateMemories).not.toHaveBeenCalled();
  });

  it('runs the sweep and consolidation and reports what each changed', async () => {
    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      expired: 3,
      remaining: false,
      consolidation: { merged: 2, superseded: 1, remaining: false },
    });
    expect(mocks.sweepExpiredMemories).toHaveBeenCalledTimes(1);
    expect(mocks.consolidateMemories).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when the sweep fails', async () => {
    mocks.sweepExpiredMemories.mockRejectedValue(new Error('neon down'));

    const response = await GET(req());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
