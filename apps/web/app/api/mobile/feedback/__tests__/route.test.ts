import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAuth, mockOptionalUser, mockNeonQuery } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockOptionalUser: vi.fn(async (): Promise<{ userId: string } | null> => null),
  mockNeonQuery: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  getOptionalAuthUser: mockOptionalUser,
  getClerkAuthUser: vi.fn(),
  assertAccountActive: vi.fn(),
  getClerkAuthorizedParties: vi.fn(() => []),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
  })),
}));

import { POST } from '../route';

function makeRequest(body: unknown) {
  return new Request('http://localhost:3000/api/mobile/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOptionalUser.mockResolvedValue(null);
  mockNeonQuery.mockResolvedValue([]);
});

describe('POST /api/mobile/feedback', () => {
  it('inserts feedback attributed to the signed-in user', async () => {
    mockOptionalUser.mockResolvedValue({ userId: 'user-1' });

    const res = await POST(makeRequest({ type: 'bug', message: 'The app crashed on launch' }));

    expect(res.status).toBe(200);
    expect(mockNeonQuery).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.feedback'),
      ['user-1', 'bug', 'The app crashed on launch', expect.stringContaining('"type":"bug"')],
    );
  });

  it('accepts anonymous feedback with a null user_id when not signed in', async () => {
    mockOptionalUser.mockResolvedValue(null);

    const res = await POST(makeRequest({ type: 'general', message: 'Love the app!' }));

    expect(res.status).toBe(200);
    expect(mockNeonQuery).toHaveBeenCalledWith(expect.any(String), [
      null,
      'general',
      'Love the app!',
      expect.any(String),
    ]);
  });

  it('400s on an invalid feedback type', async () => {
    mockOptionalUser.mockResolvedValue({ userId: 'user-1' });

    const res = await POST(makeRequest({ type: 'not-a-real-type', message: 'hello' }));

    expect(res.status).toBe(400);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  it('400s on an empty message', async () => {
    mockOptionalUser.mockResolvedValue({ userId: 'user-1' });

    const res = await POST(makeRequest({ type: 'bug', message: '   ' }));

    expect(res.status).toBe(400);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  it('400s on a message over 2000 characters', async () => {
    mockOptionalUser.mockResolvedValue({ userId: 'user-1' });

    const res = await POST(makeRequest({ type: 'bug', message: 'x'.repeat(2001) }));

    expect(res.status).toBe(400);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });
});
