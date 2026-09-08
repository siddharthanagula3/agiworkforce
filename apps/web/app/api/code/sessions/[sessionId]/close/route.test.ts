import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetUserScopedDb, mockRateLimit, mockCsrf, mockClose, mockGetSubscription } = vi.hoisted(
  () => ({
    mockGetUserScopedDb: vi.fn(),
    mockRateLimit: vi.fn(),
    mockCsrf: vi.fn(),
    mockClose: vi.fn(),
    mockGetSubscription: vi.fn(),
  }),
);

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mockGetSubscription },
}));
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-session-service')>();
  return { ...actual, closeCloudCodeSession: mockClose };
});

import { CloudCodeNotFoundError } from '@/lib/services/cloud-code-session-service';
import { POST } from './route';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };

function closeRequest(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/code/sessions/${SESSION_ID}/close`, {
    method: 'POST',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockResolvedValue(null);
  mockGetSubscription.mockResolvedValue({ plan_tier: 'pro', status: 'active' });
  mockGetUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
  mockClose.mockResolvedValue({ id: SESSION_ID, state: 'closed' });
});

describe('POST /api/code/sessions/[sessionId]/close', () => {
  it('closes the session and answers with it', async () => {
    const response = await POST(closeRequest(), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ session: { state: 'closed' } });
    expect(mockClose).toHaveBeenCalledWith(
      {},
      { userId: 'user-1', organizationId: null },
      SESSION_ID,
      'pro',
    );
  });

  it('refuses without a csrf token', async () => {
    mockCsrf.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await POST(closeRequest(), context);
    expect(response.status).toBe(403);
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('answers 404 for a session this account does not own', async () => {
    mockClose.mockRejectedValue(new CloudCodeNotFoundError());
    const response = await POST(closeRequest(), context);
    expect(response.status).toBe(404);
  });
});
