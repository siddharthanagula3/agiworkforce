import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  createPortalSession: vi.fn(),
  listCustomers: vi.fn(),
}));

vi.hoisted(() => {
  process.env['STRIPE_SECRET_KEY'] = 'sk_test_dummy';
  process.env['NEXT_PUBLIC_APP_URL'] = 'https://agiworkforce.com';
  process.env['ALLOWED_ORIGINS'] = 'https://agiworkforce.com';
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({
    userId: 'user-1',
    email: 'user@example.com',
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: mocks.query,
    execute: mocks.execute,
  }),
}));
vi.mock('stripe', () => ({
  default: class StripeMock {
    billingPortal = {
      sessions: {
        create: mocks.createPortalSession,
      },
    };
    customers = {
      list: mocks.listCustomers,
    };
    subscriptions = {
      list: vi.fn(),
      retrieve: vi.fn(),
    };
  },
}));

import { POST } from './route';

function request() {
  return new NextRequest('https://agiworkforce.com/api/portal', {
    method: 'POST',
    headers: { Origin: 'https://agiworkforce.com' },
  });
}

describe('POST /api/portal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(1);
    mocks.createPortalSession.mockResolvedValue({
      id: 'bps_1',
      url: 'https://billing.stripe.com/session/test',
    });
  });

  it('fails closed before Stripe when subscription state cannot be verified', async () => {
    mocks.query.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.listCustomers).not.toHaveBeenCalled();
    expect(mocks.createPortalSession).not.toHaveBeenCalled();
  });

  it('opens the portal for a verified linked customer', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_123',
        status: 'active',
      },
    ]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.createPortalSession).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://agiworkforce.com/pricing',
    });
  });

  describe('email fallback (BIZ-015: no cross-customer portal sessions)', () => {
    function unlinkedAccount() {
      // 1st query: no subscription row. 2nd query: profile with no customer id.
      mocks.query.mockResolvedValueOnce([]);
      mocks.query.mockResolvedValueOnce([{ stripe_customer_id: null }]);
    }

    it('refuses a customer matched only by email, and links nothing', async () => {
      unlinkedAccount();
      mocks.listCustomers.mockResolvedValueOnce({
        data: [{ id: 'cus_stranger', metadata: {} }],
      });

      const response = await POST(request());

      expect(response.status).toBe(403);
      expect(mocks.createPortalSession).not.toHaveBeenCalled();
      // The unproven customer must not be persisted onto the profile either.
      expect(mocks.execute).not.toHaveBeenCalled();
    });

    it('picks the customer whose metadata names the caller, not the email twin', async () => {
      unlinkedAccount();
      mocks.listCustomers.mockResolvedValueOnce({
        data: [
          { id: 'cus_stranger', metadata: {} },
          { id: 'cus_owned', metadata: { user_id: 'user-1' } },
        ],
      });

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(mocks.createPortalSession).toHaveBeenCalledWith({
        customer: 'cus_owned',
        return_url: 'https://agiworkforce.com/pricing',
      });
    });
  });
});
