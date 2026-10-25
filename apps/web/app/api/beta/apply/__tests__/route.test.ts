import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockAuth, mockOptionalUser, mockQuery, mockRateLimit, mockCsrf, mockEmailState } =
  vi.hoisted(() => ({
    mockAuth: vi.fn(),
    mockOptionalUser: vi.fn(async (): Promise<{ userId: string } | null> => null),
    mockQuery: vi.fn(),
    mockRateLimit: vi.fn(async () => null),
    mockCsrf: vi.fn(async () => null),
    mockEmailState: vi.fn(async (): Promise<{ confirmed: boolean; email: string | null }> => ({
      confirmed: true,
      email: 'ada@account.example',
    })),
  }));

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('@/lib/api-auth', () => ({
  getSuspendedAccountUser: vi.fn(async () => null),
  getOptionalAuthUser: mockOptionalUser,
  getClerkAuthUser: vi.fn(),
  assertAccountActive: vi.fn(),
  getClerkAuthorizedParties: vi.fn(() => []),
}));
vi.mock('@/lib/auth/email-confirmation', () => ({ readPrimaryEmailState: mockEmailState }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: mockQuery }) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';

function post(body: unknown) {
  return new NextRequest('http://localhost:3000/api/beta/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json', referer: 'http://localhost:3000/beta' },
    body: JSON.stringify(body),
  });
}

const VALID = {
  fullName: 'Ada Lovelace',
  email: 'Ada@Example.com',
  role: 'Software engineering',
  surfaces: ['desktop', 'cli'],
  useCase: 'Driving the CLI against a large monorepo.',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: null });
  mockOptionalUser.mockResolvedValue(null);
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockResolvedValue(null);
  mockQuery.mockResolvedValue([{ status: 'pending' }]);
  mockEmailState.mockResolvedValue({ confirmed: true, email: 'ada@account.example' });
});

describe('beta application intake', () => {
  it('records an application and normalizes the email', async () => {
    const response = await POST(post(VALID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ recorded: true });

    const params = mockQuery.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe('ada@example.com');
  });

  it('upserts on email for a signed-in applicant so a resubmission does not create a duplicate', async () => {
    mockOptionalUser.mockResolvedValue({ userId: 'user-1' });

    await POST(post(VALID));

    expect(String(mockQuery.mock.calls[0]?.[0])).toContain('on conflict (lower(email)) do update');
  });

  it('never replaces the account an application is bound to, or updates another account', async () => {
    mockOptionalUser.mockResolvedValue({ userId: 'user-1' });

    await POST(post(VALID));

    const sql = String(mockQuery.mock.calls[0]?.[0]);
    expect(sql).toContain(
      'user_id       = coalesce(public.beta_applications.user_id, excluded.user_id)',
    );
    expect(sql).toMatch(
      /where public\.beta_applications\.user_id is null\s+or public\.beta_applications\.user_id = excluded\.user_id/,
    );
  });

  it('only creates the row for an anonymous submission and never overwrites an existing one', async () => {
    const response = await POST(post(VALID));

    expect(response.status).toBe(200);
    const sql = String(mockQuery.mock.calls[0]?.[0]);
    expect(sql).toContain('on conflict (lower(email)) do nothing');
    expect(sql).not.toContain('do update');
  });

  it('does not tell an anonymous caller whether the address has a reviewed application', async () => {
    mockQuery.mockResolvedValue([{ status: 'rejected' }]);

    const response = await POST(post(VALID));

    await expect(response.json()).resolves.toEqual({ recorded: true, alreadyReviewed: false });
  });

  it("files a signed-in applicant's application under the account's verified address", async () => {
    mockOptionalUser.mockResolvedValue({ userId: 'user-1' });

    await POST(post({ ...VALID, email: 'victim@example.com' }));

    const params = mockQuery.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe('ada@account.example');
    expect(params[7]).toBe('user-1');
  });

  it('treats a signed-in caller without a confirmed address as anonymous', async () => {
    mockOptionalUser.mockResolvedValue({ userId: 'user-1' });
    mockEmailState.mockResolvedValue({ confirmed: false, email: 'ada@account.example' });

    await POST(post({ ...VALID, email: 'victim@example.com' }));

    const params = mockQuery.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe('victim@example.com');
    expect(params[7]).toBeNull();
    expect(String(mockQuery.mock.calls[0]?.[0])).toContain('do nothing');
  });

  it('tells a returning signed-in applicant their earlier decision still stands', async () => {
    mockOptionalUser.mockResolvedValue({ userId: 'user-1' });
    mockQuery.mockResolvedValue([{ status: 'rejected' }]);

    const response = await POST(post(VALID));

    await expect(response.json()).resolves.toMatchObject({ alreadyReviewed: true });
    // The upsert must not reset a reviewed row back to pending.
    expect(String(mockQuery.mock.calls[0]?.[0])).not.toMatch(/set[\s\S]*status\s*=/);
  });

  it('refuses a submission with no surface, so the cohort answer is never empty', async () => {
    const response = await POST(post({ ...VALID, surfaces: [] }));
    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects an unknown surface rather than storing free text', async () => {
    const response = await POST(post({ ...VALID, surfaces: ['mainframe'] }));
    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('deduplicates repeated surfaces', async () => {
    await POST(post({ ...VALID, surfaces: ['cli', 'cli', 'desktop'] }));
    const params = mockQuery.mock.calls[0]?.[1] as unknown[];
    expect(params[4]).toEqual(['cli', 'desktop']);
  });

  it('requires a CSRF token on this unauthenticated write', async () => {
    mockCsrf.mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad csrf' }), { status: 403 }) as never,
    );

    const response = await POST(post(VALID));

    expect(response.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('honours the rate limiter before touching the database', async () => {
    mockRateLimit.mockResolvedValue(new Response(null, { status: 429 }) as never);

    const response = await POST(post(VALID));

    expect(response.status).toBe(429);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('links the application to the account when the applicant is signed in', async () => {
    mockOptionalUser.mockResolvedValue({ userId: 'user-1' });

    await POST(post(VALID));

    const params = mockQuery.mock.calls[0]?.[1] as unknown[];
    expect(params[7]).toBe('user-1');
  });

  it('does not report a real database outage as intake being closed', async () => {
    mockQuery.mockRejectedValue(
      Object.assign(new Error('connection terminated'), { code: '08006' }),
    );

    const response = await POST(post(VALID));

    expect(response.status).not.toBe(503);
  });
});
