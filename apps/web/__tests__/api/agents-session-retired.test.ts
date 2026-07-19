import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const { mockAuth, mockQuery, mockExecute, mockRateLimitHandler } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockRateLimitHandler: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockAuth(...args),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mockQuery, execute: mockExecute }),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimitHandler:
    (handler: (...args: unknown[]) => unknown, key: string) =>
    (...args: unknown[]) => {
      mockRateLimitHandler(key);
      return handler(...args);
    },
}));

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));

import { POST } from '@/app/api/agents/session/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/agents/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/agents/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_session' });
  });

  it('returns Gone without reading private conversation or message rows', async () => {
    const response = await POST(makeRequest({ action: 'get', sessionId: crypto.randomUUID() }));

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: {
        code: 'ENDPOINT_RETIRED',
        message: 'Use the conversations API for managed chat sessions.',
      },
    });
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('remains authenticated and rate limited', async () => {
    mockAuth.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await POST(makeRequest({ action: 'list' }));

    expect(response.status).toBe(401);
    expect(mockRateLimitHandler).toHaveBeenCalledWith('chat-conversation');
  });
});
