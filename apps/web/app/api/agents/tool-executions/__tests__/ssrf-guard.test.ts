
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockNeonQuery, mockGetClerkAuthUser, mockRateLimitHandler } = vi.hoisted(() => ({
  mockNeonQuery: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
  mockRateLimitHandler: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mockGetClerkAuthUser }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
  })),
}));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimitHandler:
    (handler: (...args: unknown[]) => unknown, key: string) =>
    (...args: unknown[]) => {
      mockRateLimitHandler(key);
      return handler(...args);
    },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { POST } from '../route';

const TOOL_ID = '59728d91-c92f-4ffc-b618-9094561beec6';

function makeRequest() {
  return new Request('http://localhost:3000/api/agents/tool-executions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'test' },
    body: JSON.stringify({ toolId: TOOL_ID, parameters: {} }),
  }) as never;
}

describe('POST /api/agents/tool-executions — retired', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-test-1' });
  });

  it('returns Gone without reading tool or execution rows', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: {
        code: 'ENDPOINT_RETIRED',
        message: 'Agent tool execution is handled by the api-gateway agents router.',
      },
    });
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  it('never issues an outbound request — the SSRF surface is gone, not guarded', async () => {
    await POST(makeRequest());
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('remains authenticated and rate limited', async () => {
    mockGetClerkAuthUser.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mockRateLimitHandler).toHaveBeenCalledWith('me');
  });
});
