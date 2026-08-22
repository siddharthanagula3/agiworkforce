import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockAuth, mockQuery, mockRateLimit, mockCsrf } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockQuery: vi.fn(),
  mockRateLimit: vi.fn(async () => null),
  mockCsrf: vi.fn(async () => null),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
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
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockResolvedValue(null);
  mockQuery.mockResolvedValue([{ status: 'pending' }]);
});

describe('beta application intake', () => {
  it('records an application and normalizes the email', async () => {
    const response = await POST(post(VALID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ recorded: true });

    const params = mockQuery.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe('ada@example.com');
  });

  it('upserts on email so a resubmission does not create a duplicate to reconcile', async () => {
    await POST(post(VALID));
    expect(String(mockQuery.mock.calls[0]?.[0])).toContain('on conflict (lower(email))');
  });

  it('tells a returning applicant their earlier decision still stands', async () => {
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
    mockAuth.mockResolvedValue({ userId: 'user-1' });

    await POST(post(VALID));

    const params = mockQuery.mock.calls[0]?.[1] as unknown[];
    expect(params[7]).toBe('user-1');
  });

  it('says nothing was stored rather than claiming receipt when intake is not migrated', async () => {
    mockQuery.mockRejectedValue(
      Object.assign(new Error('relation "public.beta_applications" does not exist'), {
        code: '42P01',
      }),
    );

    const response = await POST(post(VALID));

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe('intake_unavailable');
    expect(body.message).toMatch(/nothing was stored/i);
  });

  it('does not report a real database outage as intake being closed', async () => {
    mockQuery.mockRejectedValue(
      Object.assign(new Error('connection terminated'), { code: '08006' }),
    );

    const response = await POST(post(VALID));

    expect(response.status).not.toBe(503);
  });
});
