import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revokeBonusCreditGrant: vi.fn(async () => 1_000),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/stripe-resource-ids', () => ({ isStripeResourceMissing: () => false }));
vi.mock('@/lib/services/bonus-credit-service', () => ({
  bonusCreditExpiry: vi.fn(),
  grantBonusCredits: vi.fn(),
  revokeBonusCreditGrant: mocks.revokeBonusCreditGrant,
}));
vi.mock('@/lib/services/notification-service', () => ({ recordNotification: vi.fn() }));
vi.mock('@/lib/services/referral-program', () => ({ REFERRAL_PROGRAM: {} }));
vi.mock('@/lib/services/referral-service', () => ({ referralDeviceOrNetworkBlock: vi.fn() }));

const { handleReferralChargeReversal } = await import('../referral-events');

describe('referral clawback', () => {
  it('deletes the referrer unapplied promotion resets next to the credit clawback', async () => {
    const executed: { sql: string; params: unknown[] }[] = [];
    const db = {
      query: vi.fn(async () => [
        {
          id: 'referral-1',
          referrer_id: 'referrer-1',
          qualifying_invoice_id: 'in_1',
          friend_bonus_grant_id: 'grant-friend',
          referrer_reward_grant_id: 'grant-referrer',
        },
      ]),
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        executed.push({ sql, params });
        return 1;
      }),
    } as unknown as DatabaseAdapter;
    const stripe = {
      invoicePayments: { list: vi.fn(async () => ({ data: [{ invoice: 'in_1' }] })) },
    } as never;

    await handleReferralChargeReversal(
      db,
      stripe,
      { id: 'ch_1', customer: 'cus_1', payment_intent: 'pi_1' } as never,
      'refund',
    );

    const cleanup = executed.find((call) =>
      call.sql.includes('delete from public.usage_limit_promotion_grants'),
    );
    expect(cleanup?.sql).toContain("like 'referral:' || $1::text || ':%'");
    expect(cleanup?.sql).toContain('applied_at is null');
    expect(cleanup?.params).toEqual(['referral-1', 'referrer-1']);
    const clawback = executed.findIndex((call) => call.sql.includes("status = 'clawed_back'"));
    expect(executed.indexOf(cleanup!)).toBeLessThan(clawback);
    expect(mocks.revokeBonusCreditGrant).toHaveBeenCalledTimes(2);
  });
});
