import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  redeliverWebhook: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/services/developer-webhook-service', () => ({
  redeliverWebhook: mocks.redeliverWebhook,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const ENDPOINT = '44444444-4444-4444-8444-444444444444';
const DELIVERY = '55555555-5555-4555-8555-555555555555';
const db = { query: vi.fn() };

function request(): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/developers/webhooks/${ENDPOINT}/deliveries/${DELIVERY}/redeliver`,
    { method: 'POST' },
  );
}

function context(endpointId = ENDPOINT, deliveryId = DELIVERY) {
  return { params: Promise.resolve({ endpointId, deliveryId }) };
}

describe('/api/developers/webhooks/[endpointId]/deliveries/[deliveryId]/redeliver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
  });

  it('refuses a request that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await POST(request(), context());
    expect(response.status).toBe(403);
    expect(mocks.redeliverWebhook).not.toHaveBeenCalled();
  });

  it('answers 404 when either id is not a uuid', async () => {
    expect((await POST(request(), context('x', DELIVERY))).status).toBe(404);
    expect((await POST(request(), context(ENDPOINT, 'y'))).status).toBe(404);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await POST(request(), context());
    expect(response.status).toBe(401);
    expect(mocks.redeliverWebhook).not.toHaveBeenCalled();
  });

  it('queues the redelivery for the caller', async () => {
    mocks.redeliverWebhook.mockResolvedValue({ id: 'd2', status: 'pending' });
    const response = await POST(request(), context());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ delivery: { id: 'd2', status: 'pending' } });
    expect(mocks.redeliverWebhook).toHaveBeenCalledWith(db, 'user-1', ENDPOINT, DELIVERY);
  });
});
