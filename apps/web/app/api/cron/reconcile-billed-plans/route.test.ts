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
  requeueSubscriptionsForReview: vi.fn(),
}));
vi.mock('@/lib/support/handoff/config', () => ({
  isValidEmail: vi.fn(() => true),
  getHandoffConfig: vi.fn(() => ({ fallbackEmail: 'ops@agiworkforce.com' })),
}));
vi.mock('@/lib/support/handoff/resend-client', () => ({
  sendSupportEmail: vi.fn(),
}));

import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import {
  reconcileBilledPlans,
  requeueSubscriptionsForReview,
} from '@/lib/services/billing-reconciliation';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';
import { GET } from './route';

const stripeClient = vi.mocked(getStripeClientOrNull);
const reconcile = vi.mocked(reconcileBilledPlans);
const requeue = vi.mocked(requeueSubscriptionsForReview);
const sendEmail = vi.mocked(sendSupportEmail);

function request(secret: string | null = 'cron-secret'): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/cron/reconcile-billed-plans', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

function drift(index: number) {
  return {
    stripeSubscriptionId: `sub_${index}`,
    userId: `user_${index}`,
    fields: ['unit_amount'],
    storedPlanTier: 'team',
    lines: [
      {
        priceId: `price_${index}`,
        currency: 'usd',
        stripePlanTier: 'team',
        stripeUnitAmount: 1,
        expectedUnitAmount: 2000,
        fields: ['unit_amount'],
      },
    ],
  };
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
    incomplete: [],
    ...overrides,
  } as Awaited<ReturnType<typeof reconcileBilledPlans>>;
}

describe('GET /api/cron/reconcile-billed-plans', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    stripeClient.mockReturnValue({} as never);
    reconcile.mockResolvedValue(report());
    sendEmail.mockResolvedValue({ delivered: true } as never);
    requeue.mockResolvedValue(undefined);
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
        drifts: [drift(1)] as never,
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

  it('names every affected subscription in the email and the answer, past the first 25', async () => {
    const drifts = Array.from({ length: 30 }, (_, index) => drift(index));
    reconcile.mockResolvedValue(
      report({ diverged: 30, divergenceRatio: 0.3, alert: true, drifts: drifts as never }),
    );

    const response = await GET(request());

    const [message] = sendEmail.mock.calls[0] as unknown as [{ text: string }];
    for (let index = 0; index < 30; index += 1) {
      expect(message.text).toContain(`sub_${index} `);
    }
    const body = (await response.json()) as { drifts: unknown[] };
    expect(body.drifts).toHaveLength(30);
  });

  it('lists a subscription that was compared only in part', async () => {
    reconcile.mockResolvedValue(
      report({
        diverged: 3,
        divergenceRatio: 0.075,
        alert: true,
        drifts: [drift(1)] as never,
        incomplete: [
          { stripeSubscriptionId: 'sub_partial', userId: 'user_p', gaps: ['no_published_price'] },
        ],
      }),
    );

    await GET(request());

    const [message] = sendEmail.mock.calls[0] as unknown as [{ text: string }];
    expect(message.text).toContain('sub_partial');
    expect(message.text).toContain('no_published_price');
  });

  it('puts the subscriptions of an undelivered report back at the head of the review queue', async () => {
    reconcile.mockResolvedValue(
      report({
        diverged: 2,
        divergenceRatio: 0.1,
        alert: true,
        drifts: [drift(1), drift(2)] as never,
      }),
    );
    sendEmail.mockResolvedValue({ delivered: false, reason: 'no_provider' } as never);

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(requeue).toHaveBeenCalledWith(expect.anything(), ['sub_1', 'sub_2']);
  });

  it('leaves the review order alone when the report was delivered', async () => {
    reconcile.mockResolvedValue(
      report({ diverged: 2, divergenceRatio: 0.1, alert: true, drifts: [drift(1)] as never }),
    );

    await GET(request());

    expect(requeue).not.toHaveBeenCalled();
  });

  it('still answers that the report was undeliverable when the requeue fails', async () => {
    reconcile.mockResolvedValue(
      report({ diverged: 2, divergenceRatio: 0.1, alert: true, drifts: [drift(1)] as never }),
    );
    sendEmail.mockResolvedValue({ delivered: false, reason: 'no_provider' } as never);
    requeue.mockRejectedValue(new Error('db down'));

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ delivery: 'undeliverable' });
  });
});
