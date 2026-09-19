import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  generateCsrfToken: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  withRateLimit: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: (...args: unknown[]) => mocks.generateCsrfToken(...args),
  getOrCreateAnonSession: (...args: unknown[]) => mocks.getOrCreateAnonSession(...args),
}));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mocks.withRateLimit(...args),
}));
vi.mock('@/lib/error-handler', () => ({
  withErrorHandler: <T extends unknown[]>(handler: (...args: T) => Promise<Response>) => handler,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import { GET } from './route';

function request(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/csrf');
}

describe('GET /api/csrf cache policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getOrCreateAnonSession.mockResolvedValue({ id: 'session-1', newCookie: null });
    mocks.generateCsrfToken.mockReturnValue('csrf-token');
  });

  it('marks a token response private and non-cacheable', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('marks a rate-limit response private and non-cacheable', async () => {
    mocks.withRateLimit.mockResolvedValue(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
    );

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('marks an error response private and non-cacheable', async () => {
    mocks.generateCsrfToken.mockImplementation(() => {
      throw new Error('failure');
    });

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
