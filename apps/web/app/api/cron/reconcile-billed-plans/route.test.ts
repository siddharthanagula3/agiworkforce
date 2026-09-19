import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: vi.fn() })),
}));
vi.mock('@/lib/server/stripe-client', () => ({
  getStripeClientOrNull: vi.fn(),
}));
vi.mock('@/lib/services/billing-reconciliation', () => ({
  reconcileBilledPlans: vi.fn(),
}));
vi.mock('@/lib/support/handoff/config', () => ({
  isValidEmail: vi.fn(() => true),
  getHandoffConfig: vi.fn(() => ({ fallbackEmail: 'ops@agiworkforce.com' })),
}));
vi.mock('@/lib/support/handoff/resend-client', () => ({
  sendSupportEmail: vi.fn(),
}));

import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import { reconcileBilledPlans } from '@/lib/services/billing-reconciliation';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';
import { GET } from './route';

const stripeClient = vi.mocked(getStripeClientOrNull);
const reconcile = vi.mocked(reconcileBilledPlans);
const sendEmail = vi.mocked(sendSupportEmail);

function request(secret: string | null = 'cron-secret'): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/cron/reconcile-billed-plans', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

function report(overrides: Partial<Awaited<ReturnType<typeof reconcileBilledPlans>>> = {}) {
  return {
    generatedAt: '2026-09-18T01:45:00.000Z',
    examined: 40,
    diverged: 0,
    uncomparable: 0,
    divergenceRatio: 0,
    alert: false,
    drifts: [],
    ...overrides,
  } as Awaited<ReturnType<typeof reconcileBilledPlans>>;
}

describe('GET /api/cron/reconcile-billed-plans', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    stripeClient.mockReturnValue({} as never);
    reconcile.mockResolvedValue(report());
    sendEmail.mockResolvedValue({ delivered: true } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('refuses a caller without the cron secret before touching Stripe', async () => {
    const response = await GET(request(null));
    expect(response.status).toBe(401);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('reports nothing compared when Stripe is not configured', async () => {
    stripeClient.mockReturnValue(null);
    const response = await GET(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ reason: 'stripe_not_configured' });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('answers the report and sends nobody an email when nothing diverged', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ examined: 40, delivery: 'not_needed' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('pages a human on divergence and answers 500 when that page cannot be delivered', async () => {
    reconcile.mockResolvedValue(
      report({
        diverged: 3,
        divergenceRatio: 0.075,
        alert: true,
        drifts: [
          {
            stripeSubscriptionId: 'sub_1',
            userId: 'user_1',
            fields: ['plan'],
            storedPlanTier: 'pro',
            stripePlanTier: 'max',
            stripeUnitAmount: 20000,
            expectedUnitAmount: 2000,
          },
        ] as never,
      }),
    );
    sendEmail.mockResolvedValue({ delivered: false, reason: 'no_provider' } as never);

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ops@agiworkforce.com',
        subject: expect.stringContaining('3/40'),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({ delivery: 'undeliverable' });
  });
});
