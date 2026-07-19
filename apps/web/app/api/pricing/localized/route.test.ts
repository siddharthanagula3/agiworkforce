import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mockGetLocalizedPricingCatalog = vi.fn();

vi.mock('@/lib/server/localized-pricing-service', () => ({
  getLocalizedPricingCatalog: (...args: unknown[]) => mockGetLocalizedPricingCatalog(...args),
}));

import { GET } from './route';

describe('GET /api/pricing/localized', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLocalizedPricingCatalog.mockResolvedValue({
      country: 'IN',
      requestedCurrency: 'inr',
      plans: {},
    });
  });

  it('uses the trusted deployment country header', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/pricing/localized', {
        headers: { 'x-vercel-ip-country': 'IN' },
      }),
    );

    expect(mockGetLocalizedPricingCatalog).toHaveBeenCalledWith('IN');
    expect(response.status).toBe(200);
    expect(response.headers.get('vary')).toContain('X-Vercel-IP-Country');
    await expect(response.json()).resolves.toMatchObject({ country: 'IN' });
  });

  it('falls back to US pricing when geolocation is unavailable locally', async () => {
    await GET(new NextRequest('http://localhost/api/pricing/localized'));

    expect(mockGetLocalizedPricingCatalog).toHaveBeenCalledWith('US');
  });
});
