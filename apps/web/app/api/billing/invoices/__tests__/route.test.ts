import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  readPage: vi.fn(),
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/services/billing-invoice-service', () => ({
  readUserBillingInvoicePage: mocks.readPage,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { GET } from '../route';

const db = { query: vi.fn() };

beforeEach(() => {
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
});

function request(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/billing/invoices');
}

describe('GET /api/billing/invoices', () => {
  it('tells the page when the provider has more invoices than it returned', async () => {
    mocks.readPage.mockResolvedValue({
      invoices: [{ id: 'in_1' }],
      available: true,
      hasMore: true,
      truncatedLineItems: [],
    });

    const body = await (await GET(request())).json();

    expect(mocks.readPage).toHaveBeenCalledWith(db, 'user-1');
    expect(body).toEqual({ invoices: [{ id: 'in_1' }], available: true, hasMore: true });
  });

  it('tells the page when no invoice source is configured', async () => {
    mocks.readPage.mockResolvedValue({
      invoices: [],
      available: false,
      hasMore: false,
      truncatedLineItems: [],
    });

    const body = await (await GET(request())).json();

    expect(body).toEqual({ invoices: [], available: false, hasMore: false });
  });
});
