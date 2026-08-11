import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ManagedMediaModelAvailabilityResponseSchema } from '@agiworkforce/cloud-contracts';
import { createError } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  authUser: vi.fn(),
  rateLimit: vi.fn(),
  resolveAvailability: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mocks.authUser }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.rateLimit }));
vi.mock('@/lib/services/media-model-availability-service', () => ({
  resolveDeploymentMediaModelAvailability: mocks.resolveAvailability,
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET } from './route';

const validAvailability = {
  catalog_version: 'fixture-v1',
  image_storage_configured: true,
  video_storage_configured: true,
  image_schema_configured: true,
  video_schema_configured: true,
  checked_at: '2026-08-09T12:00:00.000Z',
  models: [
    {
      model_id: 'catalog-image-fixture',
      name: 'Catalog image fixture',
      kind: 'image',
      provider: 'google',
      state: 'enabled',
    },
  ],
};

function request(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/media/availability', {
    headers: { origin: 'agi://cloud' },
  });
}

function expectCrossSurfaceNoStore(response: Response): void {
  expect(response.headers.get('access-control-allow-origin')).toBe('agi://cloud');
  expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
}

describe('GET /api/media/availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-fixture' });
    mocks.rateLimit.mockResolvedValue(null);
    mocks.resolveAvailability.mockResolvedValue(validAvailability);
  });

  it('returns an authenticated response that satisfies the shared contract and is never cached', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(
      ManagedMediaModelAvailabilityResponseSchema.safeParse(await response.json()).success,
    ).toBe(true);
    expectCrossSurfaceNoStore(response);
  });

  it('keeps authentication failures readable by Mobile/Electron and uncached', async () => {
    mocks.authUser.mockRejectedValue(createError.unauthorized());

    const response = await GET(request());

    expect(response.status).toBe(401);
    expectCrossSurfaceNoStore(response);
  });

  it('keeps rate-limit responses readable by Mobile/Electron and uncached', async () => {
    mocks.rateLimit.mockResolvedValue(new Response('slow down', { status: 429 }));

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(mocks.authUser).not.toHaveBeenCalled();
    expectCrossSurfaceNoStore(response);
  });

  it('keeps service failures readable by Mobile/Electron and uncached', async () => {
    mocks.resolveAvailability.mockRejectedValue(
      createError.serviceUnavailable('availability fixture failed'),
    );

    const response = await GET(request());

    expect(response.status).toBe(503);
    expectCrossSurfaceNoStore(response);
  });
});
