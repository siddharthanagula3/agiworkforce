import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  listWebhookDeliveries: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/services/developer-webhook-service', () => ({
  listWebhookDeliveries: mocks.listWebhookDeliveries,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const ENDPOINT = '44444444-4444-4444-8444-444444444444';
const db = { query: vi.fn() };

function request(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/developers/webhooks/${ENDPOINT}/deliveries`);
}

function context(endpointId = ENDPOINT) {
  return { params: Promise.resolve({ endpointId }) };
}

describe('/api/developers/webhooks/[endpointId]/deliveries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
    mocks.withRateLimit.mockResolvedValue(null);
  });

  it('returns the rate limit response before reading', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const response = await GET(request(), context());
    expect(response.status).toBe(429);
    expect(mocks.listWebhookDeliveries).not.toHaveBeenCalled();
  });

  it('answers 404 for an endpoint id that is not a uuid', async () => {
    const response = await GET(request(), context('1'));
    expect(response.status).toBe(404);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await GET(request(), context());
    expect(response.status).toBe(401);
    expect(mocks.listWebhookDeliveries).not.toHaveBeenCalled();
  });

  it('lists the deliveries of the caller endpoint', async () => {
    mocks.listWebhookDeliveries.mockResolvedValue([{ id: 'd1', status: 'delivered' }]);
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deliveries: [{ id: 'd1', status: 'delivered' }] });
    expect(mocks.listWebhookDeliveries).toHaveBeenCalledWith(db, 'user-1', ENDPOINT);
  });
});
