import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockVerifyCron, mockGetNeonDb, mockReap } = vi.hoisted(() => ({
  mockVerifyCron: vi.fn(),
  mockGetNeonDb: vi.fn(),
  mockReap: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mockVerifyCron }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mockGetNeonDb }));
vi.mock('@/lib/services/cloud-code-turn-reaper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-turn-reaper')>();
  return { ...actual, reapStuckCloudCodeTurns: mockReap };
});

import { GET } from './route';

function cronRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/reap-code-turns');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCron.mockReturnValue(true);
  mockGetNeonDb.mockReturnValue({ query: vi.fn() });
  mockReap.mockResolvedValue({
    reaped: 2,
    stoppedByUser: 1,
    sessionsReleased: 2,
    remaining: false,
  });
});

describe('GET /api/cron/reap-code-turns', () => {
  it('sweeps and reports what it ended', async () => {
    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reaped: 2,
      stoppedByUser: 1,
      sessionsReleased: 2,
      remaining: false,
    });
  });

  it('refuses a request that is not the scheduler', async () => {
    mockVerifyCron.mockReturnValue(false);
    const response = await GET(cronRequest());
    expect(response.status).toBe(401);
    expect(mockReap).not.toHaveBeenCalled();
  });

  it('answers 500 rather than reporting a sweep that did not happen', async () => {
    mockReap.mockRejectedValue(new Error('database unreachable'));
    const response = await GET(cronRequest());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });
});
