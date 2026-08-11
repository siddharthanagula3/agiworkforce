import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authUser: vi.fn(),
  csrf: vi.fn(),
  list: vi.fn(),
  permanentDelete: vi.fn(),
  rateLimit: vi.fn(),
  restore: vi.fn(),
  softDelete: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mocks.authUser }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.csrf }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.rateLimit }));
vi.mock('@/lib/server/media-assets', () => ({
  listMediaAssets: mocks.list,
  permanentlyDeleteMediaAsset: mocks.permanentDelete,
  restoreMediaAsset: mocks.restore,
  softDeleteMediaAsset: mocks.softDelete,
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { DELETE } from './route';

const ASSET_ID = '22222222-2222-4222-8222-222222222222';

function request(query = ''): NextRequest {
  return new NextRequest(`https://agiworkforce.com/api/media?id=${ASSET_ID}${query}`, {
    method: 'DELETE',
  });
}

describe('DELETE /api/media', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'owner-fixture' });
    mocks.csrf.mockResolvedValue(null);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.softDelete.mockResolvedValue(true);
    mocks.permanentDelete.mockResolvedValue(true);
  });

  it('soft-deletes a live asset by default', async () => {
    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(mocks.softDelete).toHaveBeenCalledWith('owner-fixture', ASSET_ID);
    expect(mocks.permanentDelete).not.toHaveBeenCalled();
  });

  it('permanently deletes only when the caller explicitly requests it', async () => {
    const response = await DELETE(request('&permanent=true'));

    expect(response.status).toBe(200);
    expect(mocks.permanentDelete).toHaveBeenCalledWith('owner-fixture', ASSET_ID);
    expect(mocks.softDelete).not.toHaveBeenCalled();
  });

  it('rejects an invalid permanent mode instead of silently soft-deleting', async () => {
    const response = await DELETE(request('&permanent=false'));

    expect(response.status).toBe(400);
    expect(mocks.permanentDelete).not.toHaveBeenCalled();
    expect(mocks.softDelete).not.toHaveBeenCalled();
  });
});
