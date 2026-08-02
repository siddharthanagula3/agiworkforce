import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  listCloudAgentRuns: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/cors', () => ({
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
  handleCorsPreflightRequest: vi.fn(() => null),
  withCorsRoute: vi.fn((handler) => handler),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  listCloudAgentRuns: mocks.listCloudAgentRuns,
}));

import { GET } from './route';

const db = { query: vi.fn() };

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/llm/v1/chat/completions/runs${query}`);
}

describe('GET /api/llm/v1/chat/completions/runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-owner' });
    mocks.listCloudAgentRuns.mockResolvedValue({ runs: [], next: null });
  });

  it('passes an exact request identity through the authenticated tenant and state filters', async () => {
    const response = await GET(
      request('?requestId=request-1&state=completed&state=cancelled&limit=1'),
    );

    expect(response.status).toBe(200);
    expect(mocks.listCloudAgentRuns).toHaveBeenCalledWith(db, {
      userId: 'user-owner',
      states: ['completed', 'cancelled'],
      requestId: 'request-1',
      before: undefined,
      limit: 1,
    });
    await expect(response.json()).resolves.toEqual({ runs: [], nextCursor: null });
  });

  it.each([
    '?requestId=bad%20key',
    `?requestId=${'x'.repeat(129)}`,
    '?requestId=request-1&requestId=request-2',
  ])(
    'rejects a malformed or ambiguous request identity before database access: %s',
    async (query) => {
      const response = await GET(request(query));

      expect(response.status).toBe(400);
      expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
      expect(mocks.listCloudAgentRuns).not.toHaveBeenCalled();
    },
  );
});
