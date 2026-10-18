import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendBillingNotice: vi.fn(async () => undefined),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/services/billing-notice-service', () => ({
  sendBillingNotice: mocks.sendBillingNotice,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { PURCHASED_CREDIT_EXPIRY_RULES } from '@agiworkforce/types';
import { remindExpiringPurchasedCredits } from '../purchased-credit-expiry-service';

const PURCHASE_ID = '11111111-1111-4111-8111-111111111111';

function database(): DatabaseAdapter {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('from public.expiring_credit_purchases')) {
      return [
        {
          id: PURCHASE_ID,
          user_id: 'user-1',
          expires_at: '2026-11-01T00:00:00.000Z',
          created_at: '2026-05-01T00:00:00.000Z',
        },
      ];
    }
    if (sql.includes('prepaid_credit_lots_microusd')) {
      return [{ lot_id: PURCHASE_ID, remaining_microusd: '5000000' }];
    }
    return [];
  });
  return { query, execute: vi.fn(async () => undefined) } as unknown as DatabaseAdapter;
}

describe('remindExpiringPurchasedCredits', () => {
  it('states the expiry period of the rule that matched the purchase', async () => {
    expect(PURCHASED_CREDIT_EXPIRY_RULES.find((rule) => rule.country === 'JP')?.months).toBe(6);

    const summary = await remindExpiringPurchasedCredits(database(), 10);

    expect(summary.reminded).toBeGreaterThan(0);
    expect(mocks.sendBillingNotice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        message: expect.stringContaining(
          'Credits bought in Japan expire 6 months after purchase, so use them before that date.',
        ),
      }),
    );
  });
});
