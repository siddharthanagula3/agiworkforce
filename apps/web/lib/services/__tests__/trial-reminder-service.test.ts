import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { Stripe } from '@/lib/stripe-types';
type BillingNoticeModule = typeof import('@/lib/services/billing-notice-service');
type LoggerModule = typeof import('@/lib/logger');

const mocks = vi.hoisted(() => ({
  sendBillingNotice: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: mocks.logger,
}));
vi.mock('@/lib/services/billing-notice-service', async (importOriginal) => ({
  ...(await importOriginal<BillingNoticeModule>()),
  sendBillingNotice: mocks.sendBillingNotice,
}));

import { TRIAL_REMINDER_DAYS, remindConvertingTrials } from '../trial-reminder-service';

const NOW = new Date('2026-10-03T12:00:00Z');
const DAY_SECONDS = 86_400;
const TRIAL = {
  user_id: 'user_123',
  stripe_subscription_id: 'sub_1TrialEndingAbc123',
  plan_tier: 'pro',
};

const query = vi.fn();
const retrieveSubscription = vi.fn();
const createInvoicePreview = vi.fn();
const db = { query, execute: vi.fn() } as unknown as DatabaseAdapter;
const stripe = {
  subscriptions: { retrieve: retrieveSubscription },
  invoices: { createPreview: createInvoicePreview },
} as unknown as Stripe;

function trialEndingIn(days: number) {
  return {
    id: TRIAL.stripe_subscription_id,
    status: 'trialing',
    trial_end: Math.floor(NOW.getTime() / 1000) + days * DAY_SECONDS,
    cancel_at_period_end: false,
    cancel_at: null,
    items: { data: [{ price: { recurring: { interval: 'month' } } }] },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubEnv('CSRF_SECRET', 'trial-cancel-link-signing-secret-0123456789');
  query.mockResolvedValue([TRIAL]);
  retrieveSubscription.mockResolvedValue(trialEndingIn(1));
  createInvoicePreview.mockResolvedValue({ amount_due: 2000, currency: 'usd' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('remindConvertingTrials', () => {
  it('counts an emailed reminder as reminded and sends the charge, the date and a cancel link', async () => {
    mocks.sendBillingNotice.mockResolvedValue({ recorded: true, emailed: true });

    expect(await remindConvertingTrials(db, stripe, 100)).toEqual({
      reminded: 1,
      skipped: 0,
      failed: 0,
      remaining: false,
    });
    expect(mocks.sendBillingNotice).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        userId: TRIAL.user_id,
        dedupeKey: `trial-ending:${TRIAL.stripe_subscription_id}`,
        message: expect.stringMatching(/October 4, 2026.*charged \$20, and again every month/),
        action: {
          label: 'Cancel your trial',
          url: expect.stringContaining('/trial/cancel?token='),
        },
      }),
    );
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it('counts a reminder recorded in the app but not emailed as failed and logs the subscription', async () => {
    mocks.sendBillingNotice.mockResolvedValue({ recorded: true, emailed: false });

    expect(await remindConvertingTrials(db, stripe, 100)).toEqual({
      reminded: 0,
      skipped: 0,
      failed: 1,
      remaining: false,
    });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      { userId: TRIAL.user_id, subscriptionId: TRIAL.stripe_subscription_id, recorded: true },
      expect.stringContaining('Trial reminder was not emailed'),
    );
  });

  it('skips a trial that ends later than the reminder window without sending anything', async () => {
    retrieveSubscription.mockResolvedValue(trialEndingIn(TRIAL_REMINDER_DAYS + 1));

    expect(await remindConvertingTrials(db, stripe, 100)).toEqual({
      reminded: 0,
      skipped: 1,
      failed: 0,
      remaining: false,
    });
    expect(mocks.sendBillingNotice).not.toHaveBeenCalled();
  });
});
