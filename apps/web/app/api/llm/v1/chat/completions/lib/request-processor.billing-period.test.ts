import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  BILLING_PERIOD_NOT_RENEWED_CODE,
  billingPeriodLapsed,
  handleBillingPeriodLapsed,
} from './request-processor';

const NOW = new Date('2026-10-19T10:00:00.000Z');

describe('a paid period that ended without renewing', () => {
  it('is lapsed only when no credit account covers now and the period end has passed', () => {
    const ended = { current_period_end: new Date('2026-10-19T08:57:55.000Z') };
    expect(billingPeriodLapsed(ended, null, NOW)).toBe(true);
    expect(billingPeriodLapsed(ended, { account_id: null }, NOW)).toBe(true);
    expect(billingPeriodLapsed(ended, { account_id: 'acct-1' }, NOW)).toBe(false);
    expect(
      billingPeriodLapsed({ current_period_end: new Date('2026-11-19T00:00:00Z') }, null, NOW),
    ).toBe(false);
    expect(billingPeriodLapsed(undefined, null, NOW)).toBe(false);
  });

  it('refuses with the reason instead of claiming the budget was used up', async () => {
    const response = handleBillingPeriodLapsed({
      current_period_end: new Date('2026-10-19T08:57:55.000Z'),
      plan_tier: 'max_15x',
    } as Parameters<typeof handleBillingPeriodLapsed>[0]);

    expect(response.status).toBe(402);
    const body = JSON.stringify(await response.json());
    expect(body).toContain(BILLING_PERIOD_NOT_RENEWED_CODE);
    expect(body).toContain('billing period ended on Oct 19, 2026 and has not renewed yet');
    expect(body).not.toContain('Usage budget exhausted');
  });
});
