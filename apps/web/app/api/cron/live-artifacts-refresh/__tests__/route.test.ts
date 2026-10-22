import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  refreshLiveArtifacts: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mocks.db }));
vi.mock('../refresh-live-artifacts', () => ({
  refreshLiveArtifacts: mocks.refreshLiveArtifacts,
}));

import { GET } from '../route';

function call() {
  return GET(new NextRequest('http://localhost/api/cron/live-artifacts-refresh'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/cron/live-artifacts-refresh', () => {
  it('refuses a caller without the cron secret and touches nothing', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);
    const response = await call();
    expect(response.status).toBe(401);
    expect(mocks.refreshLiveArtifacts).not.toHaveBeenCalled();
  });

  it('runs one bounded pass on the service connection and reports it', async () => {
    mocks.verifyCronRequest.mockReturnValue(true);
    const summary = { claimed: 2, ready: 1, needsConnection: 1, failed: 0, deferred: 0 };
    mocks.refreshLiveArtifacts.mockResolvedValue(summary);
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
    expect(mocks.refreshLiveArtifacts).toHaveBeenCalledWith(mocks.db);
  });

  it('answers 500 without detail when the pass fails', async () => {
    mocks.verifyCronRequest.mockReturnValue(true);
    mocks.refreshLiveArtifacts.mockRejectedValue(new Error('connection refused'));
    const response = await call();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
