import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  findPluginScanForUser: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/services/plugin-marketplace-service', () => ({
  findPluginScanForUser: mocks.findPluginScanForUser,
}));

import { GET } from '../route';

const db = { query: vi.fn() };

function call(id: string) {
  return GET(new NextRequest(`http://localhost/api/plugins/${id}/scan`), {
    params: Promise.resolve({ id }),
  });
}

describe('GET /api/plugins/[id]/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await call('acme.tools');

    expect(response.status).toBe(401);
    expect(mocks.findPluginScanForUser).not.toHaveBeenCalled();
  });

  it('rate limits per user', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await call('acme.tools');

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'model-catalog',
      'user:user-1',
    );
    expect(mocks.findPluginScanForUser).not.toHaveBeenCalled();
  });

  it('answers a null scan for a malformed plugin id without a lookup', async () => {
    const response = await call('Bad Id!');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ scan: null });
    expect(mocks.findPluginScanForUser).not.toHaveBeenCalled();
  });

  it('returns the caller scan with a private no-store cache policy', async () => {
    const scan = { verdict: 'clean', scannedAt: '2026-09-01T00:00:00.000Z' };
    mocks.findPluginScanForUser.mockResolvedValue(scan);

    const response = await call('acme.tools');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ scan });
    expect(mocks.findPluginScanForUser).toHaveBeenCalledWith(db, 'user-1', 'acme.tools');
  });
});
